import React from 'react';
import "./Login.css";
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {

  const navigate = useNavigate();

    const handleButtonClick = () => {
        navigate('/');
    };

    return (
        <>
            <h1>Login</h1>
            <form className="loginForm" action="" method="post">
                <input type="text" id="uname" placeholder="Username"/>
                <input type="password" id="pw" placeholder="Password"/>
                <button type="button" className="loginButton" onClick={handleButtonClick}>Login</button>
                <p>Not a Grungus yet?
                <a href="/register"> Reconsider</a>
                </p>
            </form>
        </>
    );
}

export default Login;