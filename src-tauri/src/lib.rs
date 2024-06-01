use ring::aead::{self, Aad, LessSafeKey, Nonce, UnboundKey};
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair, UnparsedPublicKey, ED25519};

#[tauri::command]
fn encrypt(message: &str) -> String {
    let rng = SystemRandom::new();
    let pkcs8_bytes = Ed25519KeyPair::generate_pkcs8(&rng).unwrap();
    let key_pair = Ed25519KeyPair::from_pkcs8(pkcs8_bytes.as_ref()).unwrap();

    let public_key_bytes = key_pair.public_key().as_ref().to_vec();
    let private_key_bytes = pkcs8_bytes.as_ref().to_vec();

    let public_key = UnparsedPublicKey::new(&ED25519, &public_key_bytes);
    let signature = key_pair.sign(message.as_bytes());
    let symmetric_key = &private_key_bytes[..32]; // Todo use a proper key derivation function
    let encrypted_msg = encrypt_message(symmetric_key, message.as_bytes());
    let decrypted_msg = decrypt_message(symmetric_key, &encrypted_msg);
    let decrypted_msg = String::from_utf8(decrypted_msg).unwrap();

    let verified = public_key
        .verify(message.as_bytes(), signature.as_ref())
        .is_ok();
    let verified = if verified { "verified" } else { "not verified" };

    format!(
        "Public key: {:?}\nPrivate key: {:?}\nSignature: {:?}\nEncrypted message: {:?}\nDecrypted message: {:?}\n{}",
        public_key_bytes,
        private_key_bytes,
        signature.as_ref(),
        encrypted_msg,
        decrypted_msg,
        verified
    )
}

fn encrypt_message(key: &[u8], msg: &[u8]) -> Vec<u8> {
    let sealing_key = LessSafeKey::new(UnboundKey::new(&aead::AES_256_GCM, key).unwrap());
    let mut in_out = msg.to_vec();
    let tag_len = aead::AES_256_GCM.tag_len();
    in_out.extend(vec![0u8; tag_len]);
    let nonce = Nonce::assume_unique_for_key([0; 12]);
    sealing_key
        .seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
        .unwrap();
    in_out
}

fn decrypt_message(key: &[u8], encrypted_msg: &[u8]) -> Vec<u8> {
    let opening_key =
        aead::LessSafeKey::new(aead::UnboundKey::new(&aead::AES_256_GCM, key).unwrap());
    let nonce = aead::Nonce::assume_unique_for_key([0; 12]);
    let mut in_out = encrypted_msg.to_vec();
    opening_key
        .open_in_place(nonce, aead::Aad::empty(), &mut in_out)
        .unwrap()
        .to_vec()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![encrypt])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
