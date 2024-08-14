import React, { useState,useEffect } from "react";

interface Server {
  id: string;
  name: string;
  picture: string;
}

const fallbackData: Server = {
  id: "fallback",
  name: "Fallback Server",
  picture: "https://picsum.photos/200",
};

interface NavbarProps {
  selectedServerIndex: number | null;
  onSelectServer: (index: number) => void;
}

const Navbar: React.FC<NavbarProps> = ({ selectedServerIndex, onSelectServer }) => {
  const [servers, setServers] = useState<Server[]>([]);
  const [userPfp, setUserPfp] = useState<string>("./grungo.png"); // Placeholder for user pfp

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const response = await fetch("http://localhost/api/servers");
        const data: Server[] = await response.json();
        setServers(data);
      } catch (error) {
        console.error("Failed to fetch server data:", error);
        setServers([fallbackData]);
      }
    };

    fetchServers();
  }, []);

  const navbarContainer: React.CSSProperties = {
    margin: "0.7rem 0 0.7rem 0.7rem",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    backdropFilter: "blur(3px)",
    WebkitBackdropFilter: "blur(3px)",
    border: "solid 2px rgba(255, 255, 255, 0.20)",
    height: "calc(100vh - 1.4rem)",
    width: "5rem",
    minWidth: "5rem",
    borderRadius: "10px",
    display: "flex",
    justifyContent: "center",
    zIndex: 30,
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

  const pfpStyle = (selected: boolean): React.CSSProperties => ({
    margin: "0.5rem 0",
    borderRadius: "10px",
    width: "80%",
    cursor: "pointer",
    border: selected ? "2px solid #9E9E9E" : "0px",
    transform: selected ? "scale(1.05)" : "scale(1)",
    transition: "transform 0.3s ease",
    WebkitTransform: selected ? "scale(1.05)" : "scale(1)",
    WebkitTransition: "transform 0.3s ease",
  });

  return (
    <div style={navbarContainer}>
      <ul style={ulStyle}>
        {/* User's Profile Picture */}
        <li style={liStyle}>
          <img style={pfpStyle(false)} src={userPfp} alt="User Profile" />
        </li>

        {/* Server Profile Pictures */}
        {servers.length > 0 ? (
          servers.map((server, index) => (
            <li
              key={server.id}
              style={liStyle}
              onClick={() => onSelectServer(index)}
            >
              <img
                style={pfpStyle(selectedServerIndex === index)}
                src={server.picture}
                alt={server.name}
              />
            </li>
          ))
        ) : (
          <li style={liStyle}>No servers found</li>
        )}
      </ul>
    </div>
  );
};

export default Navbar;
