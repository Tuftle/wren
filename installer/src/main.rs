//! Wren's installer: one small window in Wren's own look. It carries Wren's real setup program inside it, runs that
//! quietly into the person's own folder (no administrator needed) and shows how far it has got as an egg that hatches.
#![windows_subsystem = "windows"]

use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use eframe::egui::{
    self, epaint::CubicBezierShape, Align2, Color32, CornerRadius, FontData, FontDefinitions, FontFamily, FontId, Mesh, Pos2, Rect,
    Sense, Shape, Stroke, Vec2,
};

const MAGIC: &[u8; 8] = b"WRENSETP";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// Wren's colours (the dark theme)

// ---- colours: the same palette as tuftle.vercel.app, dark or cream like the system's setting --------------------------

fn light() -> bool {
    static LIGHT: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *LIGHT.get_or_init(|| {
        // `--light` and `--dark` choose by hand, for previews
        if std::env::args().any(|a| a == "--light") {
            return true;
        }
        if std::env::args().any(|a| a == "--dark") {
            return false;
        }
        Command::new("reg")
            .args(["query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "/v", "AppsUseLightTheme"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim_end().ends_with("0x1"))
            .unwrap_or(false)
    })
}

fn pick(dark: [u8; 3], light_: [u8; 3]) -> Color32 {
    let c = if light() { light_ } else { dark };
    Color32::from_rgb(c[0], c[1], c[2])
}

fn bg() -> Color32 { pick([0x21, 0x1c, 0x17], [0xf4, 0xef, 0xe6]) }
fn card() -> Color32 { pick([0x2a, 0x23, 0x1c], [0xfb, 0xf8, 0xf2]) }
fn line() -> Color32 { pick([0x3a, 0x31, 0x28], [0xdd, 0xd2, 0xc1]) }
fn text() -> Color32 { pick([0xe6, 0xdc, 0xcd], [0x3b, 0x2f, 0x25]) }
fn soft() -> Color32 { pick([0x9a, 0x8b, 0x7a], [0x8a, 0x7b, 0x6b]) }
fn amber() -> Color32 { pick([0xd9, 0xa0, 0x73], [0x8a, 0x4b, 0x2a]) }
fn brown() -> Color32 { Color32::from_rgb(0x8a, 0x4b, 0x2a) }
fn cream() -> Color32 { Color32::from_rgb(0xf4, 0xef, 0xe6) }
fn shell() -> Color32 { Color32::from_rgb(0xf3, 0xe9, 0xd6) }
fn glow() -> Color32 { Color32::from_rgb(0xff, 0xc6, 0x6e) }

#[derive(Clone, PartialEq)]
enum Screen {
    Welcome,
    Installing,
    Done,
    Failed(String),
    Confirm,
    Removing,
    Removed(bool),
}

#[derive(Default)]
struct Shared {
    fraction: f32,
    finished: Option<Result<(), String>>,
}

struct App {
    screen: Screen,
    desktop_shortcut: bool,
    shared: Arc<Mutex<Shared>>,
    shown: f32,
    started_at: f64,
    done_at: f64,
    auto: bool,
    uninstall: bool,
    delete_data: bool,
    install_dir: PathBuf,
}

fn install_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Wren"));
    base.join("Programs").join("Wren")
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            match entry.metadata() {
                Ok(m) if m.is_dir() => total += dir_size(&entry.path()),
                Ok(m) => total += m.len(),
                Err(_) => {}
            }
        }
    }
    total
}

/// Takes Wren's own setup program out of the end of this file: [payload][expected size: u64][payload length: u64]["WRENSETP"]
fn take_payload() -> Result<(PathBuf, u64), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut file = File::open(&exe).map_err(|e| e.to_string())?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    if len < 24 {
        return Err("this installer is incomplete".into());
    }
    file.seek(SeekFrom::Start(len - 24)).map_err(|e| e.to_string())?;
    let mut footer = [0u8; 24];
    file.read_exact(&mut footer).map_err(|e| e.to_string())?;
    if &footer[16..24] != MAGIC {
        return Err("this installer is incomplete: it has no setup program inside".into());
    }
    let expected = u64::from_le_bytes(footer[0..8].try_into().unwrap());
    let payload_len = u64::from_le_bytes(footer[8..16].try_into().unwrap());
    if payload_len == 0 || payload_len > len - 24 {
        return Err("this installer is damaged".into());
    }
    file.seek(SeekFrom::Start(len - 24 - payload_len)).map_err(|e| e.to_string())?;
    let dir = std::env::temp_dir().join("wren-setup");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join("wren-setup-program.exe");
    let mut out = File::create(&target).map_err(|e| e.to_string())?;
    std::io::copy(&mut file.take(payload_len), &mut out).map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())?;
    Ok((target, expected))
}

/// `--update`: Wren started this setup to replace itself. It is already closing; wait until it is gone before touching its files.
fn is_update() -> bool {
    std::env::args().any(|a| a == "--update")
}

fn wren_is_running() -> bool {
    Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq wren.exe", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase().contains("wren.exe"))
        .unwrap_or(false)
}

fn run_install(shared: Arc<Mutex<Shared>>, desktop: bool, dir: PathBuf, ctx: egui::Context) {
    let result = (|| -> Result<(), String> {
        if is_update() {
            let mut waited = 0;
            while wren_is_running() {
                if waited >= 120 {
                    return Err("wren is still open. close it and run the update again".into());
                }
                std::thread::sleep(Duration::from_millis(500));
                waited += 1;
            }
        }
        let (setup, expected) = take_payload()?;
        let desktop_arg = if desktop { "true" } else { "false" };
        let mut command = Command::new(&setup);
        command
            .arg("/S")
            .raw_arg(format!("/InstallDirectoryPath=\"{}\"", dir.display()))
            .arg("/PreventRebootRequired=true")
            .arg("/MaintenanceService=false")
            .arg("/StartMenuShortcuts=true")
            .arg("/TaskbarShortcut=false")
            .arg(format!("/DesktopShortcut={desktop_arg}"))
            .creation_flags(CREATE_NO_WINDOW);
        let mut child = command.spawn().map_err(|e| format!("could not start the setup: {e}"))?;
        let status = loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                break status;
            }
            let fraction = (dir_size(&dir) as f32 / expected.max(1) as f32).min(0.97);
            shared.lock().unwrap().fraction = fraction;
            ctx.request_repaint();
            std::thread::sleep(Duration::from_millis(250));
        };
        let _ = fs::remove_file(&setup);
        if !status.success() {
            return Err(format!("the setup stopped with code {}", status.code().unwrap_or(-1)));
        }
        if !dir.join("wren.exe").exists() {
            return Err("wren.exe was not found after the setup".into());
        }
        let _ = write_uninstaller(&dir);
        Ok(())
    })();
    let mut s = shared.lock().unwrap();
    s.fraction = 1.0;
    s.finished = Some(result);
    ctx.request_repaint();
}

// ---- the uninstaller ------------------------------------------------------------------------------------------------

/// Puts a copy of this window (without the setup program on its end) into Wren's folder and makes Windows' "Uninstall"
/// button open it.
fn write_uninstaller(dir: &Path) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut file = File::open(&exe).map_err(|e| e.to_string())?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    let mut stub_len = len;
    if len >= 24 {
        file.seek(SeekFrom::Start(len - 24)).map_err(|e| e.to_string())?;
        let mut footer = [0u8; 24];
        file.read_exact(&mut footer).map_err(|e| e.to_string())?;
        if &footer[16..24] == MAGIC {
            stub_len = len - 24 - u64::from_le_bytes(footer[8..16].try_into().unwrap());
        }
    }
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let folder = dir.join("uninstall");
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let target = folder.join("Wren-Uninstall.exe");
    let mut out = File::create(&target).map_err(|e| e.to_string())?;
    std::io::copy(&mut file.take(stub_len), &mut out).map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())?;

    // the entry the setup program made in Windows' list of apps
    let base = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall";
    let found = Command::new("reg").args(["query", base, "/f", "Wren", "/k"]).creation_flags(CREATE_NO_WINDOW).output().map_err(|e| e.to_string())?;
    let listing = String::from_utf8_lossy(&found.stdout).to_string();
    for key in listing.lines().map(str::trim).filter(|l| l.starts_with("HKEY_CURRENT_USER") && l.to_lowercase().contains("wren")) {
        let command = format!("\"{}\" --uninstall", target.display());
        let _ = Command::new("reg")
            .args(["add", key, "/v", "UninstallString", "/t", "REG_SZ", "/d", &command, "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    Ok(())
}

/// When the uninstaller is started from inside Wren's folder it moves to a temporary place first, so that the folder
/// can be removed while it runs.
fn move_out_of_the_way() {
    let args: Vec<String> = std::env::args().collect();
    let exe = match std::env::current_exe() {
        Ok(e) => e,
        Err(_) => return,
    };
    let dir = match args.iter().position(|a| a == "--dir").and_then(|i| args.get(i + 1)) {
        Some(d) => PathBuf::from(d),
        None => match exe.parent().and_then(|p| p.parent()) {
            Some(d) => d.to_path_buf(),
            None => return,
        },
    };
    if exe.starts_with(&dir) {
        let temp = std::env::temp_dir().join(format!("wren-uninstall-{}.exe", std::process::id()));
        if fs::copy(&exe, &temp).is_ok() {
            let mut again = Command::new(&temp);
            again.args(&args[1..]);          // whatever it was started with (such as --remove) goes along
            if !args.iter().any(|a| a == "--dir") {
                again.arg("--dir").arg(&dir);
            }
            again.creation_flags(0x0000_0008);
            if again.spawn().is_ok() {
                std::process::exit(0);
            }
        }
    }
}

fn uninstall_dir() -> PathBuf {
    let args: Vec<String> = std::env::args().collect();
    if let Some(d) = args.iter().position(|a| a == "--dir").and_then(|i| args.get(i + 1)) {
        return PathBuf::from(d);
    }
    std::env::current_exe().ok().and_then(|e| e.parent().and_then(|p| p.parent()).map(|p| p.to_path_buf())).unwrap_or_else(install_dir)
}

fn run_uninstall(shared: Arc<Mutex<Shared>>, dir: PathBuf, delete_data: bool, ctx: egui::Context) {
    let result = (|| -> Result<(), String> {
        // ask Wren to close, and after a few seconds make sure it has
        let _ = Command::new("taskkill").args(["/IM", "wren.exe"]).creation_flags(CREATE_NO_WINDOW).status();
        std::thread::sleep(Duration::from_secs(4));
        let _ = Command::new("taskkill").args(["/F", "/IM", "wren.exe"]).creation_flags(CREATE_NO_WINDOW).status();
        std::thread::sleep(Duration::from_millis(600));

        let first = dir_size(&dir).max(1);
        let helper = dir.join("uninstall").join("helper.exe");
        if helper.exists() {
            let mut child = Command::new(&helper).arg("/S").creation_flags(CREATE_NO_WINDOW).spawn().map_err(|e| format!("could not start the removal: {e}"))?;
            let mut quiet_for = 0;
            let mut last = first;
            loop {
                let exited = child.try_wait().map_err(|e| e.to_string())?.is_some();
                let now = dir_size(&dir);
                shared.lock().unwrap().fraction = (1.0 - now as f32 / first as f32).clamp(0.0, 0.96);
                ctx.request_repaint();
                if exited && (now == last || !dir.join("wren.exe").exists()) {
                    quiet_for += 1;
                } else {
                    quiet_for = 0;
                }
                last = now;
                if quiet_for >= 4 || !dir.join("wren.exe").exists() && exited {
                    break;
                }
                std::thread::sleep(Duration::from_millis(250));
            }
        }
        // what is left: a log, and this very window's old copy
        for _ in 0..20 {
            if !dir.exists() || fs::remove_dir_all(&dir).is_ok() {
                break;
            }
            std::thread::sleep(Duration::from_millis(300));
        }
        if delete_data {
            for base in ["APPDATA", "LOCALAPPDATA"] {
                if let Some(root) = std::env::var_os(base) {
                    let folder = PathBuf::from(root).join("Mozilla").join("Wren");
                    let _ = fs::remove_dir_all(folder);
                }
            }
        }
        if dir.join("wren.exe").exists() {
            return Err("some files could not be removed. close anything that is using them and try again".into());
        }
        Ok(())
    })();
    let mut s = shared.lock().unwrap();
    s.fraction = 1.0;
    s.finished = Some(result);
    ctx.request_repaint();
}

/// Removes this window's own temporary copy once it has closed.
fn forget_myself() {
    if let Ok(exe) = std::env::current_exe() {
        if exe.starts_with(std::env::temp_dir()) {
            let _ = Command::new("cmd")
                .args(["/C", &format!("ping -n 4 127.0.0.1 >nul & del /f /q \"{}\"", exe.display())])
                .creation_flags(CREATE_NO_WINDOW | 0x0000_0008)
                .spawn();
        }
    }
}

// ---- drawing -------------------------------------------------------------------------------------------------

fn rot(p: Pos2, origin: Pos2, a: f32) -> Pos2 {
    let (s, c) = a.sin_cos();
    let d = p - origin;
    Pos2::new(origin.x + d.x * c - d.y * s, origin.y + d.x * s + d.y * c)
}

fn lerp_color(a: Color32, b: Color32, t: f32) -> Color32 {
    let m = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * t).round() as u8;
    Color32::from_rgb(m(a.r(), b.r()), m(a.g(), b.g()), m(a.b(), b.b()))
}

/// An egg: narrower at the top. `from`..`to` are angles (0 is the top), so half an egg can be drawn too.
fn egg_points(c: Pos2, w: f32, h: f32, from: f32, to: f32, n: usize) -> Vec<Pos2> {
    (0..=n)
        .map(|i| {
            let t = from + (to - from) * i as f32 / n as f32;
            Pos2::new(c.x + (w / 2.0) * t.sin() * (1.0 - 0.12 * t.cos()), c.y - (h / 2.0) * t.cos())
        })
        .collect()
}

/// Fills a shape that is not convex by fanning triangles from a point inside it.
fn fan(painter: &egui::Painter, centre: Pos2, ring: &[Pos2], fill: Color32, stroke: Stroke) {
    let mut mesh = Mesh::default();
    mesh.colored_vertex(centre, fill);
    for p in ring {
        mesh.colored_vertex(*p, fill);
    }
    for i in 1..ring.len() as u32 {
        mesh.add_triangle(0, i, i + 1);
    }
    mesh.add_triangle(0, ring.len() as u32, 1);
    painter.add(Shape::mesh(mesh));
    if stroke.width > 0.0 {
        let mut closed = ring.to_vec();
        closed.push(ring[0]);
        painter.add(Shape::line(closed, stroke));
    }
}

fn zigzag(from: Pos2, to: Pos2, steps: usize, amp: f32) -> Vec<Pos2> {
    (0..=steps)
        .map(|i| {
            let t = i as f32 / steps as f32;
            let y_off = if i == 0 || i == steps { 0.0 } else if i % 2 == 0 { -amp } else { amp };
            Pos2::new(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t + y_off)
        })
        .collect()
}

const CRACKS: [(f32, f32); 9] = [
    (0.04, -0.44), (-0.10, -0.32), (0.08, -0.18), (-0.14, -0.04), (0.10, 0.08), (-0.20, 0.17), (0.02, 0.26), (-0.24, 0.33), (0.0, 0.38),
];

/// The egg, shaking a little and cracking more as `f` grows from 0 to 1.
fn draw_egg(painter: &egui::Painter, centre: Pos2, size: f32, f: f32, time: f64) {
    let w = size * 0.74;
    let h = size;
    let base = Pos2::new(centre.x, centre.y + h / 2.0);
    // the shadow it stands on
    painter.add(Shape::ellipse_filled(Pos2::new(centre.x, base.y + 6.0), Vec2::new(w * 0.52, 8.0), Color32::from_black_alpha(70)));
    let shake = if f > 0.12 { ((time * 9.0).sin() as f32) * 0.035 * (0.4 + f) } else { 0.0 };
    let pts: Vec<Pos2> = egg_points(centre, w, h, 0.0, std::f32::consts::TAU, 72).into_iter().map(|p| rot(p, base, shake)).collect();
    painter.add(Shape::convex_polygon(pts.clone(), shell(), Stroke::new(1.5, Color32::from_rgb(0xc9, 0xb2, 0x8c))));
    // a soft shine on the left, and the speckles
    painter.add(Shape::ellipse_filled(rot(Pos2::new(centre.x - w * 0.18, centre.y - h * 0.22), base, shake), Vec2::new(w * 0.16, h * 0.2), Color32::from_rgb(0xfa, 0xf3, 0xe6)));
    for (dx, dy, r) in [(0.22, -0.2, 3.0), (-0.28, 0.1, 2.5), (0.12, 0.28, 3.5), (-0.1, -0.34, 2.0), (0.3, 0.05, 2.0)] {
        painter.add(Shape::circle_filled(rot(Pos2::new(centre.x + w * dx, centre.y + h * dy), base, shake), r, Color32::from_rgb(0xc4, 0xa8, 0x82)));
    }
    // the cracks, drawn one piece at a time
    let visible = ((f / 0.9).clamp(0.0, 1.0) * CRACKS.len() as f32).floor() as usize;
    if visible >= 2 {
        let line: Vec<Pos2> = CRACKS[..visible.min(CRACKS.len())].iter().map(|(u, v)| rot(Pos2::new(centre.x + w * u, centre.y + h * v), base, shake)).collect();
        painter.add(Shape::line(line.clone(), Stroke::new(7.0, glow().gamma_multiply(0.35))));
        painter.add(Shape::line(line, Stroke::new(2.2, Color32::from_rgb(0x8a, 0x5a, 0x36))));
    }
}

/// The little wren, standing, brown with a cream-and-amber front.
fn draw_wren(painter: &egui::Painter, origin: Pos2, scale: f32, hop: f32) {
    let at = |x: f32, y: f32| Pos2::new(origin.x + (x - 62.0) * scale, origin.y + (y - 99.0 - hop) * scale);
    // legs
    for x in [54.0, 68.0] {
        painter.add(Shape::line_segment([at(x, 90.0), at(x, 99.0 + hop)], Stroke::new(3.5 * scale, Color32::from_rgb(0x6f, 0x3b, 0x20))));
    }
    // tail
    painter.add(Shape::CubicBezier(CubicBezierShape::from_points_stroke(
        [at(80.0, 68.0), at(100.0, 64.0), at(104.0, 46.0), at(96.0, 30.0)], false, Color32::TRANSPARENT, Stroke::new(10.0 * scale, brown()),
    )));
    painter.add(Shape::circle_filled(at(96.0, 31.0), 5.0 * scale, brown()));
    // body, head, beak
    painter.add(Shape::ellipse_filled(at(62.0, 74.0), Vec2::new(28.0 * scale, 21.0 * scale), brown()));
    painter.add(Shape::circle_filled(at(42.0, 57.0), 14.0 * scale, brown()));
    painter.add(Shape::convex_polygon(vec![at(30.0, 54.0), at(14.0, 52.0), at(29.0, 61.0)], brown(), Stroke::NONE));
    // the front
    painter.add(Shape::ellipse_filled(at(64.0, 77.0), Vec2::new(15.0 * scale, 8.0 * scale), Color32::from_rgb(0xe0, 0xa8, 0x70)));
    // the eye
    painter.add(Shape::circle_filled(at(38.0, 54.0), 2.8 * scale, cream()));
    painter.add(Shape::circle_filled(at(38.6, 54.4), 1.5 * scale, Color32::from_rgb(0x2a, 0x12, 0x06)));
}

/// Two halves of a shell lying open.
fn draw_shell_halves(painter: &egui::Painter, centre: Pos2, size: f32) {
    let w = size * 0.74;
    let h = size;
    let t_c = 1.67_f32; // the angle where the egg is cut
    // the lower half, standing on the ground
    let mut low = egg_points(centre, w, h, t_c, std::f32::consts::TAU - t_c, 40);
    let (right, left) = (low[0], *low.last().unwrap());
    low.extend(zigzag(left, right, 8, 7.0));
    let low_centre = Pos2::new(centre.x, centre.y + h * 0.28);
    fan(painter, low_centre, &low, shell(), Stroke::new(1.5, Color32::from_rgb(0xc9, 0xb2, 0x8c)));
    // the top half, lifted and tipped to one side
    let mut top = egg_points(centre, w, h, -t_c, t_c, 40);
    let (a, b) = (top[0], *top.last().unwrap());
    top.extend(zigzag(b, a, 8, 7.0));
    let pivot = Pos2::new(centre.x - w * 0.5, centre.y - h * 0.05);
    let moved: Vec<Pos2> = top.iter().map(|p| rot(*p, pivot, -0.55) + Vec2::new(-w * 0.55, -h * 0.12)).collect();
    let top_centre = rot(Pos2::new(centre.x, centre.y - h * 0.28), pivot, -0.55) + Vec2::new(-w * 0.55, -h * 0.12);
    fan(painter, top_centre, &moved, shell(), Stroke::new(1.5, Color32::from_rgb(0xc9, 0xb2, 0x8c)));
}

fn button(ui: &mut egui::Ui, rect: Rect, label: &str, primary: bool) -> bool {
    let response = ui.allocate_rect(rect, Sense::click());
    let hover = response.hovered();
    let (fill, text, stroke) = if primary {
        (if hover { pick([0xe6, 0xb5, 0x8a], [0x9c, 0x58, 0x33]) } else { amber() }, bg(), Stroke::NONE)
    } else {
        (if hover { card() } else { Color32::TRANSPARENT }, text(), Stroke::new(1.0, if hover { amber() } else { line() }))
    };
    let radius = (rect.height() / 2.0) as u8;
    ui.painter().add(Shape::rect_filled(rect, CornerRadius::same(radius), fill));
    if stroke.width > 0.0 {
        ui.painter().add(Shape::rect_stroke(rect, CornerRadius::same(radius), stroke, egui::StrokeKind::Inside));
    }
    ui.painter().text(rect.center(), Align2::CENTER_CENTER, label, FontId::proportional(18.0), text);
    if hover {
        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
    }
    response.clicked()
}

impl App {
    fn new(cc: &eframe::CreationContext<'_>) -> Self {
        // Georgia is on every Windows computer; it is what Wren is written in
        let mut fonts = FontDefinitions::default();
        if let Ok(bytes) = fs::read(r"C:\Windows\Fonts\georgia.ttf") {
            fonts.font_data.insert("georgia".into(), Arc::new(FontData::from_owned(bytes)));
            fonts.families.get_mut(&FontFamily::Proportional).unwrap().insert(0, "georgia".into());
        }
        cc.egui_ctx.set_fonts(fonts);
        let mut visuals = if light() { egui::Visuals::light() } else { egui::Visuals::dark() };
        visuals.widgets.inactive.bg_fill = card();
        visuals.widgets.inactive.weak_bg_fill = card();
        visuals.widgets.inactive.bg_stroke = Stroke::new(1.0, line());
        visuals.selection.bg_fill = amber();
        visuals.widgets.hovered.bg_stroke = Stroke::new(1.0, amber());
        visuals.override_text_color = Some(text());
        cc.egui_ctx.set_visuals(visuals);
        let mut screen = if std::env::args().any(|a| a == "--uninstall") { Screen::Confirm } else { Screen::Welcome };
        let mut preview = 0.0;
        for arg in std::env::args().skip(1) {
            if let Some(v) = arg.strip_prefix("--preview-installing=") {
                screen = Screen::Installing;
                preview = v.parse().unwrap_or(0.5);
            } else if arg == "--preview-done" {
                screen = Screen::Done;
            } else if let Some(v) = arg.strip_prefix("--preview-removing=") {
                screen = Screen::Removing;
                preview = v.parse().unwrap_or(0.5);
            } else if arg == "--preview-removed" {
                screen = Screen::Removed(true);
            }
        }
        let shared = Shared { fraction: preview, finished: None };
        App {
            screen,
            desktop_shortcut: true,
            shared: Arc::new(Mutex::new(shared)),
            shown: preview,
            started_at: 0.0,
            done_at: 0.0,
            auto: std::env::args().any(|a| a == "--install"),
            uninstall: std::env::args().any(|a| a == "--uninstall"),
            delete_data: false,
            install_dir: install_dir(),
        }
    }

    fn start_removal(&mut self, ctx: &egui::Context) {
        self.screen = Screen::Removing;
        self.shown = 0.0;
        let shared = self.shared.clone();
        let dir = uninstall_dir();
        let delete = self.delete_data;
        let ctx2 = ctx.clone();
        std::thread::spawn(move || run_uninstall(shared, dir, delete, ctx2));
    }

    fn start(&mut self, ctx: &egui::Context) {
        self.screen = Screen::Installing;
        self.started_at = ctx.input(|i| i.time);
        let shared = self.shared.clone();
        let dir = self.install_dir.clone();
        let desktop = self.desktop_shortcut;
        let ctx2 = ctx.clone();
        std::thread::spawn(move || run_install(shared, desktop, dir, ctx2));
    }
}

impl eframe::App for App {
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        [0.0, 0.0, 0.0, 0.0]
    }

    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let time = ctx.input(|i| i.time);
        if self.screen == Screen::Confirm && std::env::args().any(|a| a == "--remove") {
            self.start_removal(ctx);      // `--uninstall --remove` skips the question
        }
        if self.auto && self.screen == Screen::Welcome {
            self.start(ctx);       // `Wren-Setup.exe --install` goes straight to installing
        }
        // progress shown eases towards the real one, so it never jumps
        let (target, finished) = {
            let s = self.shared.lock().unwrap();
            (s.fraction, s.finished.clone())
        };
        if self.screen == Screen::Removing {
            self.shown += (target - self.shown) * 0.08;
            ctx.request_repaint();
            if let Some(result) = finished.clone() {
                if self.shown > 0.985 || result.is_err() {
                    self.shown = 1.0;
                    self.done_at = time;
                    self.screen = match result {
                        Ok(()) => Screen::Removed(!self.delete_data),
                        Err(e) => Screen::Failed(e),
                    };
                }
            }
        }
        if self.screen == Screen::Installing {
            self.shown += (target - self.shown) * 0.08;
            ctx.request_repaint();
            if let Some(result) = finished {
                if self.shown > 0.985 || result.is_err() {
                    self.shown = 1.0;
                    self.done_at = time;
                    self.screen = match result {
                        Ok(()) => Screen::Done,
                        Err(e) => Screen::Failed(e),
                    };
                }
            }
        }
        if self.screen == Screen::Done {
            ctx.request_repaint_after(Duration::from_millis(33));
            if is_update() && time - self.done_at > 1.6 {
                let _ = Command::new(self.install_dir.join("wren.exe")).spawn();
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            }
        }

        egui::CentralPanel::default().frame(egui::Frame::NONE).show(ctx, |ui| {
            let full = ui.max_rect();
            let painter = ui.painter().clone();
            painter.add(Shape::rect_filled(full, CornerRadius::same(18), bg()));
            painter.add(Shape::rect_stroke(full.shrink(0.5), CornerRadius::same(18), Stroke::new(1.0, line()), egui::StrokeKind::Inside));
            // a warm glow at the top, like the browser's own pages
            {
                let mut mesh = Mesh::default();
                let centre = Pos2::new(full.center().x, full.top() + 10.0);
                mesh.colored_vertex(centre, Color32::from_rgba_premultiplied(26, 18, 10, 26));
                for i in 0..48 {
                    let a = std::f32::consts::TAU * i as f32 / 48.0;
                    mesh.colored_vertex(centre + Vec2::new(a.cos() * 330.0, a.sin() * 230.0), Color32::TRANSPARENT);
                }
                for i in 1..48u32 {
                    mesh.add_triangle(0, i, i + 1);
                }
                mesh.add_triangle(0, 48, 1);
                painter.with_clip_rect(full).add(Shape::mesh(mesh));
            }

            // the title bar: drag it to move the window; the cross closes it (not while installing)
            let bar = Rect::from_min_size(full.min, Vec2::new(full.width() - 60.0, 52.0));
            let bar_response = ui.interact(bar, egui::Id::new("bar"), Sense::click_and_drag());
            if bar_response.drag_started() {
                ctx.send_viewport_cmd(egui::ViewportCommand::StartDrag);
            }
            if self.screen != Screen::Installing && self.screen != Screen::Removing {
                let cross = Rect::from_center_size(Pos2::new(full.right() - 30.0, full.top() + 28.0), Vec2::splat(32.0));
                let r = ui.allocate_rect(cross, Sense::click());
                painter.text(cross.center(), Align2::CENTER_CENTER, "\u{00d7}", FontId::proportional(26.0), if r.hovered() { text() } else { soft() });
                if r.clicked() {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                }
            }
            painter.text(Pos2::new(full.left() + 26.0, full.top() + 28.0), Align2::LEFT_CENTER, "wren", FontId::proportional(18.0), soft());

            let cx = full.center().x;
            match self.screen.clone() {
                Screen::Welcome => {
                    draw_wren(&painter, Pos2::new(cx, full.top() + 168.0), 1.15, 0.0);
                    painter.text(Pos2::new(cx, full.top() + 206.0), Align2::CENTER_TOP, "welcome to wren", FontId::proportional(34.0), text());
                    painter.text(Pos2::new(cx, full.top() + 256.0), Align2::CENTER_TOP, "a quiet, warm place to browse.", FontId::proportional(17.0), soft());
                    painter.text(Pos2::new(cx, full.top() + 282.0), Align2::CENTER_TOP, "nothing is sent home, and nothing follows you around.", FontId::proportional(17.0), soft());
                    let check = Rect::from_min_size(Pos2::new(cx - 130.0, full.top() + 332.0), Vec2::new(300.0, 24.0));
                    ui.put(check, egui::Checkbox::new(&mut self.desktop_shortcut, egui::RichText::new("add a shortcut on the desktop").size(16.0).color(text())));
                    painter.text(
                        Pos2::new(cx, full.bottom() - 34.0),
                        Align2::CENTER_CENTER,
                        "installs just for you, in your own folder. no administrator needed.",
                        FontId::proportional(14.0),
                        soft(),
                    );
                    if button(ui, Rect::from_center_size(Pos2::new(cx, full.top() + 388.0), Vec2::new(210.0, 46.0)), "install wren", true) {
                        self.start(ctx);
                    }
                }
                Screen::Installing => {
                    let f = self.shown.clamp(0.0, 1.0);
                    draw_egg(&painter, Pos2::new(cx, full.top() + 190.0), 190.0, f, time);
                    painter.text(Pos2::new(cx, full.top() + 322.0), Align2::CENTER_TOP, "settling in\u{2026}", FontId::proportional(26.0), text());
                    painter.text(
                        Pos2::new(cx, full.top() + 360.0),
                        Align2::CENTER_TOP,
                        format!("{}%   a few moments, then it is yours.", (f * 100.0).round() as u32),
                        FontId::proportional(16.0),
                        soft(),
                    );
                    // a thin bar under the text
                    let track = Rect::from_center_size(Pos2::new(cx, full.top() + 410.0), Vec2::new(300.0, 6.0));
                    painter.add(Shape::rect_filled(track, CornerRadius::same(3), line()));
                    let mut filled = track;
                    filled.set_width(track.width() * f);
                    painter.add(Shape::rect_filled(filled, CornerRadius::same(3), amber()));
                }
                Screen::Done => {
                    let since = (time - self.done_at) as f32;
                    let rise = (since / 0.7).clamp(0.0, 1.0);
                    let hop = ((since * 7.0).sin().abs() * 6.0 * (1.0 - (since / 2.5).clamp(0.0, 1.0))).max(0.0);
                    draw_shell_halves(&painter, Pos2::new(cx + 6.0, full.top() + 222.0), 150.0);
                    draw_wren(&painter, Pos2::new(cx + 6.0, full.top() + 262.0 - 8.0 * (1.0 - rise)), 1.35 * (0.5 + 0.5 * rise), hop);
                    let a = (255.0 * rise) as u8;
                    painter.text(Pos2::new(cx, full.top() + 306.0), Align2::CENTER_TOP, "wren is ready", FontId::proportional(32.0), Color32::from_rgba_unmultiplied(text().r(), text().g(), text().b(), a));
                    painter.text(
                        Pos2::new(cx, full.top() + 350.0),
                        Align2::CENTER_TOP,
                        "everything is in place. hello, small thing.",
                        FontId::proportional(16.0),
                        Color32::from_rgba_unmultiplied(soft().r(), soft().g(), soft().b(), a),
                    );
                    if button(ui, Rect::from_center_size(Pos2::new(cx - 75.0, full.top() + 408.0), Vec2::new(138.0, 42.0)), "open wren", true) {
                        let _ = Command::new(self.install_dir.join("wren.exe")).spawn();
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                    if button(ui, Rect::from_center_size(Pos2::new(cx + 75.0, full.top() + 408.0), Vec2::new(138.0, 42.0)), "close", false) {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                }
                Screen::Confirm => {
                    draw_wren(&painter, Pos2::new(cx, full.top() + 160.0), 1.15, 0.0);
                    painter.text(Pos2::new(cx, full.top() + 198.0), Align2::CENTER_TOP, "remove wren?", FontId::proportional(34.0), text());
                    painter.text(Pos2::new(cx, full.top() + 250.0), Align2::CENTER_TOP, "wren and its add-ons will be taken off this computer.", FontId::proportional(17.0), soft());
                    painter.text(Pos2::new(cx, full.top() + 276.0), Align2::CENTER_TOP, "your bookmarks, history and settings stay, unless you tick the box.", FontId::proportional(17.0), soft());
                    let check = Rect::from_min_size(Pos2::new(cx - 190.0, full.top() + 326.0), Vec2::new(400.0, 24.0));
                    ui.put(check, egui::Checkbox::new(&mut self.delete_data, egui::RichText::new("also delete my bookmarks, history and settings").size(16.0).color(text())));
                    if button(ui, Rect::from_center_size(Pos2::new(cx - 100.0, full.top() + 392.0), Vec2::new(180.0, 46.0)), "keep wren", true) {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                    if button(ui, Rect::from_center_size(Pos2::new(cx + 100.0, full.top() + 392.0), Vec2::new(180.0, 46.0)), "remove wren", false) {
                        self.start_removal(ctx);
                    }
                    painter.text(Pos2::new(cx, full.bottom() - 28.0), Align2::CENTER_CENTER, "if wren is open, it will be closed.", FontId::proportional(14.0), soft());
                }
                Screen::Removing => {
                    let f = self.shown.clamp(0.0, 1.0);
                    // the cracks close up as wren is packed away
                    draw_egg(&painter, Pos2::new(cx, full.top() + 190.0), 190.0, 1.0 - f, time);
                    painter.text(Pos2::new(cx, full.top() + 322.0), Align2::CENTER_TOP, "packing up\u{2026}", FontId::proportional(26.0), text());
                    painter.text(Pos2::new(cx, full.top() + 360.0), Align2::CENTER_TOP, format!("{}%", (f * 100.0).round() as u32), FontId::proportional(16.0), soft());
                    let track = Rect::from_center_size(Pos2::new(cx, full.top() + 410.0), Vec2::new(300.0, 6.0));
                    painter.add(Shape::rect_filled(track, CornerRadius::same(3), line()));
                    let mut filled = track;
                    filled.set_width(track.width() * f);
                    painter.add(Shape::rect_filled(filled, CornerRadius::same(3), amber()));
                }
                Screen::Removed(kept) => {
                    draw_egg(&painter, Pos2::new(cx, full.top() + 178.0), 170.0, 0.0, 0.0);
                    painter.text(Pos2::new(cx, full.top() + 292.0), Align2::CENTER_TOP, "wren is removed", FontId::proportional(32.0), text());
                    let line = if kept {
                        "your bookmarks and settings are still on this computer."
                    } else {
                        "everything of yours was deleted too."
                    };
                    painter.text(Pos2::new(cx, full.top() + 338.0), Align2::CENTER_TOP, line, FontId::proportional(16.0), soft());
                    painter.text(Pos2::new(cx, full.top() + 364.0), Align2::CENTER_TOP, "come back whenever you like.", FontId::proportional(16.0), soft());
                    if button(ui, Rect::from_center_size(Pos2::new(cx, full.top() + 414.0), Vec2::new(170.0, 42.0)), "close", true) {
                        forget_myself();
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                }
                Screen::Failed(message) => {
                    draw_wren(&painter, Pos2::new(cx, full.top() + 160.0), 1.1, 0.0);
                    painter.text(Pos2::new(cx, full.top() + 200.0), Align2::CENTER_TOP, "that didn't work", FontId::proportional(30.0), text());
                    painter.text(Pos2::new(cx, full.top() + 248.0), Align2::CENTER_TOP, message, FontId::proportional(15.0), soft());
                    painter.text(Pos2::new(cx, full.top() + 300.0), Align2::CENTER_TOP, "nothing was changed on your computer that you need to undo.", FontId::proportional(15.0), soft());
                    painter.text(Pos2::new(cx, full.top() + 324.0), Align2::CENTER_TOP, "you can try again, or write to tuftle@proton.me.", FontId::proportional(15.0), soft());
                    if button(ui, Rect::from_center_size(Pos2::new(cx, full.top() + 392.0), Vec2::new(160.0, 42.0)), "close", true) {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                }
            }
        });
        let _ = (lerp_color(bg(), card(), 0.0), self.started_at);
    }
}

fn main() -> eframe::Result {
    if std::env::args().any(|a| a == "--uninstall") {
        move_out_of_the_way();
    }
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title(if std::env::args().any(|a| a == "--uninstall") { "Remove Wren" } else { "Wren Setup" })
            .with_inner_size([640.0, 470.0])
            .with_resizable(false)
            .with_maximize_button(false)
            .with_decorations(false)
            .with_transparent(true),
        centered: true,
        ..Default::default()
    };
    eframe::run_native("Wren Setup", options, Box::new(|cc| Ok(Box::new(App::new(cc)))))
}
