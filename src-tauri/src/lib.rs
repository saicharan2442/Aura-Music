#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let port = portpicker::pick_unused_port().expect("failed to find an unused port");

  tauri::Builder::default()
    .plugin(tauri_plugin_localhost::Builder::new(port).build())
    .setup(move |app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(dev)]
      let url = tauri::WebviewUrl::default();

      #[cfg(not(dev))]
      let url = tauri::WebviewUrl::External(
        format!("http://localhost:{}", port)
          .parse()
          .expect("valid localhost URL"),
      );

      tauri::WebviewWindowBuilder::new(app, "main", url)
        .title("Aura Music")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .fullscreen(false)
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

