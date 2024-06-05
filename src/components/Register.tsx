import React from 'react';
import "./Login.css";
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {

  const navigate = useNavigate();

    const handleButtonClick = () => {
        navigate('/login');
    };

    return (
        <>
            <h1>Login</h1>
            <form className="loginForm" action="" method="post">
                <input type="text" id="uname" placeholder="Username"/>
                <input type="password" id="pw" placeholder="Password"/>
                <input type="password" id="repeatpw" placeholder="Repeat Password"/>
                <button type="button" className="loginButton" onClick={handleButtonClick}>Register</button>
                <p>Already a Grungus?
                <a href="/login"> Nice</a>
                </p>
            </form>
        </>
    );
}

export default Login;