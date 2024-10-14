import React from 'react';
import "./css/Login.css";
import { useNavigate } from 'react-router-dom';
import { Input } from "../components/ui/input";

const Login: React.FC = () => {

  const navigate = useNavigate();

    const handleButtonClick = () => {
        navigate('/');
    };

    return (
        <>
            <h1>Login</h1>
            <form className="loginForm" action="" method="post">
                <Input type="text" id="uname" placeholder="Username" />
                <Input type="password" id="pw" placeholder="Password"/>
                <button type="button" className="loginButton" onClick={handleButtonClick}>Login</button>
                <p>Not a Grungus yet?
                <a href="/register"> Reconsider</a>
                </p>
            </form>
        </>
    );
}

export default Login;