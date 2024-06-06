import React from "react";
import Login from "../components/Login";
import Background from "../components/background";
import MFA from "../components/MFA"

const LoginScreen: React.FC = () => {
    const pageContainerStyle: React.CSSProperties = {
        display: 'flex',
        width: '100vw',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
    };

    const loginContainerStyle: React.CSSProperties = {
        display: 'flex',
        width: '700px',
        height: '450px',
    };

    const leftLoginStyle: React.CSSProperties = {
        width: '300px',
        backgroundColor: 'rgba(89,106,235,255)',
        backgroundImage: 'url("/grungo.png")',
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: '0px 40px',
        borderTopLeftRadius: '10px',
        borderBottomLeftRadius: '10px',
        display: 'flex',
        justifyContent: 'center',
        boxShadow: 'inset 10px 10px 25px rgba(0, 0, 0, 0.3), inset -10px -10px 25px rgba(0, 0, 0, 0.3)'
    };

    return (
        <>
            <Background />
            <div style={pageContainerStyle}>
                <div style={loginContainerStyle}>
                    <div style={leftLoginStyle}>
                    </div>
                    <div className="rightLogin">
                        <Login />
                    </div>
                </div>
            </div>
        </>
    );
};

export default LoginScreen;
