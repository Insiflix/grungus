use std::sync::Mutex;

use rand::rngs::OsRng;
use rsa::{Pkcs1v15Encrypt, RsaPrivateKey, RsaPublicKey};
use serde_json::json;
use tauri::{Manager, State, Wry};
use tauri_plugin_store::StoreBuilder;

#[tauri::command]
fn encrypt(message: &str, state: State<'_, AppState>) -> String {
    let mut rng = OsRng;
    let bits = 2048;
    let priv_key = RsaPrivateKey::new(&mut rng, bits).expect("failed to generate a key");
    let pub_key = RsaPublicKey::from(&priv_key);

    let store = state.store.lock().unwrap();
    let user = store.get("username").expect("Failed to get from store");

    let username = user.as_str().expect("Failed to convert to string");
    let full_message = format!("{}: {}", username, message);

    let data = full_message.as_bytes();
    let enc_data = pub_key
        .encrypt(&mut rng, Pkcs1v15Encrypt, &data[..])
        .expect("failed to encrypt");

    let dec_data = priv_key
        .decrypt(Pkcs1v15Encrypt, &enc_data)
        .expect("failed to decrypt");

    let decrypted_message = String::from_utf8(dec_data).expect("failed to convert to string");

    format!("Decrypted data: {}", decrypted_message)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let mut store = StoreBuilder::new("app_data.bin").build(app.handle().clone());

            store
                .insert("username".to_string(), json!("Julian"))
                .expect("Failed to insert into store");
            store.save().expect("Failed to save store");

            app.manage(AppState {
                store: Mutex::new(store),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![encrypt])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

struct AppState {
    store: Mutex<tauri_plugin_store::Store<Wry>>,
}
