import React, { useState, useEffect } from "react";
import "./css/Navbar.css";

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

  const pfpStyle = (selected: boolean) =>
    selected ? "pfp-style pfp-selected" : "pfp-style pfp-unselected";

  return (
    <div className="navbar-container">
      <ul className="ul-style">
        {/* User's Profile Picture */}
        <li className="li-style">
          <img className="pfp-style pfp-unselected" src={userPfp} alt="User Profile" />
        </li>

        {/* Server Profile Pictures */}
        {servers.length > 0 ? (
          servers.map((server, index) => (
            <li key={server.id} className="li-style" onClick={() => onSelectServer(index)}>
              <img className={pfpStyle(selectedServerIndex === index)} src={server.picture} alt={server.name} />
            </li>
          ))
        ) : (
          <li className="li-style">No servers found</li>
        )}
      </ul>
    </div>
  );
};

export default Navbar;
