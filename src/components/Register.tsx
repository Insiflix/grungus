import React from 'react';
import "./Login.css";
import { useNavigate } from 'react-router-dom';
import { Input } from "../components/ui/input";

const Login: React.FC = () => {

  const navigate = useNavigate();

    const handleButtonClick = () => {
        navigate('/login');
    };

    return (
        <>
            <h1>Login</h1>
            <form className="loginForm" action="" method="post">
                <Input type="text" id="uname" placeholder="Username" />
                <Input type="password" id="pw" placeholder="Password"/>
                <Input type="password" id="repeatpw" placeholder="Repeat Password"/>
                <button type="button" className="loginButton" onClick={handleButtonClick}>Register</button>
                <p>Already a Grungus?
                <a href="/login"> Nice</a>
                </p>
            </form>
        </>
    );
}

export default Login;