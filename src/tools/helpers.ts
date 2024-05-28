import axios, { AxiosInstance } from "axios";

const axiosClient: AxiosInstance = axios.create({
	baseURL: "http://localhost:4000",
	timeout: 5000,
	headers: {
		"Content-Type": "application/json",
	},
});

export default axiosClient;
