import React from 'react';

const Background: React.FC = () => {
    const backgroundStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        backgroundImage: 'url("/bg.png")',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        filter: 'blur(5px)'
    };

    return (
        <div style={backgroundStyle}></div>
    );
};

export default Background;
