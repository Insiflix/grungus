import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
	const [message, setMessage] = useState("");
	const [input, setInput] = useState("");

	async function encrypt() {
		const msg = (await invoke("encrypt", { message: input })) as string;
		setMessage(msg.substring(0, msg.length - 42));
		setInput("");
	}

	return (
		<div className="d-flex">
			<input
				placeholder="message"
				value={input}
				style={{ color: "black" }}
				onChange={e => setInput(e.target.value)}
			/>
			<button onClick={encrypt}>Encrypt</button>
			<h1>{message}</h1>
		</div>
	);
}

export default App;
