import React from "react";

const Navbar = () => {
  const navbarContainer: React.CSSProperties = {
    margin: "1vh 0 1vh 0.5vw",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    backdropFilter: "blur(2px)",
    border: "solid 2px rgba(255, 255, 255, 0.20)",
    height: "98vh",
    width: "4vw",
    borderRadius: "10px",
    display: "flex",
    justifyContent: "center",
  };

  const ulStyle: React.CSSProperties = {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
  };

  const liStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  };

  const pfpStyle: React.CSSProperties = {
    margin: "1vh 0 1vh 0",
    borderRadius: "10px",
    width: "80%",
  };

  return (
    <div style={navbarContainer}>
      <ul style={ulStyle}>
        <li style={liStyle}>
          <img style={pfpStyle} src="https://picsum.photos/200" alt="pfp" />
        </li>
        <li style={liStyle}>test</li>
        <li style={liStyle}>test2</li>
      </ul>
    </div>
  );
};

export default Navbar;
