import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { socket } from "./tools/socket";
import "./App.css";
import Background from "./components/background";

function App() {
	const [message, setMessage] = useState("");
	const [input, setInput] = useState("");

	async function encrypt() {
		const msg = (await invoke("encrypt", { message: input })) as string;
		setMessage(msg);
		setInput("");
	}

	useEffect(() => {
		socket.connect();
		socket.on("message", (msg: string) => {
			console.log(msg);
		});
		socket.on("connect", () => {
			console.log("connected");
		});
		socket.on("disconnect", () => {
			console.log("disconnected");
		});
		socket.on("error", (err: any) => {
			console.log(err);
		});
		return () => {
			socket.off("message");
			socket.off("connect");
			socket.off("disconnect");
			socket.off("error");
		};
	}, []);

	return (
		<>
			<Background></Background>
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
				<a className="m-2" href="/login">
					Login
				</a>
			</div>
		</>
	);
}

export default App;
