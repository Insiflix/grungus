import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
	const [message, setMessage] = useState("");
	const [input, setInput] = useState("");

	async function encrypt() {
		const msg = (await invoke("encrypt", { message: input })) as string;
		setMessage(msg);
		setInput("");
	}

	return (
		<div className="d-flex">
			<input
				placeholder="message"
				value={input}
				className="text-white bg-gray-800 p-2 rounded-lg"
				onChange={e => setInput(e.target.value)}
			/>
			<button
				className="bg-blue-500 text-white p-2 rounded-lg ml-2"
				onClick={encrypt}>
				Encrypt
			</button>
			<h1>{message}</h1>
		</div>
	);
}

export default App;
