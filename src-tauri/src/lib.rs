use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

struct AppState {
    children: Mutex<Vec<Child>>,
}

fn spawn_hidden(program: &str, args: &[&str], cwd: &str) -> Option<Child> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new(program)
            .args(args)
            .current_dir(cwd)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .ok()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new(program)
            .args(args)
            .current_dir(cwd)
            .spawn()
            .ok()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            children: Mutex::new(Vec::new()),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let mut children = Vec::new();

            // ── ComfyUI ──────────────────────────────────────────────
            let comfy_python = r"C:\Users\ADMIN\Desktop\AI\ComfyUI\venv\Scripts\python.exe";
            let comfy_dir    = r"C:\Users\ADMIN\Desktop\AI\ComfyUI";
            if let Some(child) = spawn_hidden(comfy_python, &["main.py"], comfy_dir) {
                println!("ComfyUI started (pid {})", child.id());
                children.push(child);
            } else {
                eprintln!("Failed to start ComfyUI");
            }

            // ── Backend (uvicorn) ─────────────────────────────────────
            let python      = r"C:\Users\ADMIN\AppData\Local\Programs\Python\Python311\python.exe";
            let backend_dir = r"C:\Users\ADMIN\Desktop\custom holiday\backend";
            if let Some(child) = spawn_hidden(
                python,
                &["-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"],
                backend_dir,
            ) {
                println!("Backend started (pid {})", child.id());
                children.push(child);
            } else {
                eprintln!("Failed to start backend");
            }

            // ── n8n ───────────────────────────────────────────────────
            let n8n_path = r"C:\Users\ADMIN\AppData\Roaming\npm\n8n.cmd";
            if let Some(child) = spawn_hidden("cmd", &["/C", n8n_path], r"C:\Users\ADMIN") {
                println!("n8n started (pid {})", child.id());
                children.push(child);
            } else {
                eprintln!("Failed to start n8n");
            }

            // ── PDF Service ───────────────────────────────────────────
            let pdf_dir = r"C:\Users\ADMIN\Desktop\PDF Service";
            if let Some(child) = spawn_hidden("node", &["server.js"], pdf_dir) {
                println!("PDF Service started (pid {})", child.id());
                children.push(child);
            } else {
                eprintln!("Failed to start PDF Service");
            }

            // ── Frontend server (for other PCs on WiFi) ───────────────
            let frontend_dir = r"C:\Users\ADMIN\Desktop\custom holiday\dist";
            if let Some(child) = spawn_hidden(
                "cmd",
                &["/C", "npx serve -s . -l 3000"],
                frontend_dir,
            ) {
                println!("Frontend server started (pid {})", child.id());
                children.push(child);
            } else {
                eprintln!("Failed to start frontend server");
            }

            // ── Ollama ────────────────────────────────────────────────
            if let Some(child) = spawn_hidden(
                "cmd",
                &["/C", "ollama serve"],
                r"C:\Users\ADMIN",
            ) {
                println!("Ollama started (pid {})", child.id());
                children.push(child);
            } else {
                eprintln!("Failed to start Ollama");
            }

            // Store children in app state
            let state = app.state::<AppState>();
            *state.children.lock().unwrap() = children;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<AppState>();
                let mut children = state.children.lock().unwrap();
                for child in children.iter_mut() {
                    let _ = child.kill();
                    println!("Killed process {}", child.id());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}