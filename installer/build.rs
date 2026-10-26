fn main() {
    // the installer's own icon, and its name in file properties
    let mut res = winres::WindowsResource::new();
    res.set_icon("wren.ico");
    res.set("ProductName", "Wren Setup");
    res.set("FileDescription", "Wren Setup");
    res.set("CompanyName", "tuftle");
    if let Err(e) = res.compile() {
        println!("cargo:warning=could not add the icon: {e}");
    }
}
