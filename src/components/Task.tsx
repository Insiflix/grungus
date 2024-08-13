import React, { useState, useEffect } from "react";
import InvertedRadius from "./ui/invertedRadius";

interface Task {
  pfp: string;
  name: string;
  status: string;
  onlineStatus: string;
}

interface TaskID {
  id: string;
  selected: boolean;
  onClick: () => void;
}

const testData: Task = {
  pfp: "https://picsum.photos/200",
  name: "Ritalin Royale Käse",
  status: "Krabben Koitus",
  onlineStatus: "online",
};

const Task = ({ id, selected, onClick }: TaskID) => {
  const [task, setTask] = useState<Task | null>(testData);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const url = `http://localhost/api/${id}`;
        const response = await fetch(url);
        const data: Task = await response.json();
        setTask(data);
      } catch (error) {
        console.error("Failed to fetch task data:", error);
      }
    };

    fetchData();
  }, [id]);

  if (!task) {
    return null;
  }


  const taskContainer: React.CSSProperties = {
    display: "flex",
    backgroundColor: "rgba(148, 148, 148, 0.25)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    width: "11.9vw",
    alignItems: "center",
    padding: "0.5rem",
    cursor: "pointer",
    border: selected ? "1px solid #9E9E9E" : "0px",
    borderTopLeftRadius: "10px",
    borderTopRightRadius: "10px",
    borderBottomLeftRadius: selected ? "0px" : "10px",
    borderBottomRightRadius: selected ? "0px" : "10px",
    transform: selected ? "scale(1.05)" : "scale(1)",
    transition: "transform 0.3s ease",
  };

  const transitionStyle: React.CSSProperties = {
    backgroundColor: "rgba(148, 148, 148, 0.25)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: selected ? "1px solid #9E9E9E" : "0px",
    margin: "0.05rem 0 0 0",
    height: "0.7rem",
    width: "12.9vw",
    borderTopLeftRadius: "10px",
    borderTopRightRadius: "10px",
    visibility: selected ? "visible" : "hidden",
    transform: selected ? "scale(1.05)" : "scale(1)",
    transition: "transform 0.3s ease",
  };

  const ttContainer: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  }

  const imageContainer: React.CSSProperties = {
    position: "relative",
    marginRight: "0.5rem",
  };

  const taskImg: React.CSSProperties = {
    height: "2.4rem",
    width: "2.4rem",
    minWidth: "2.4rem",
    borderRadius: "45px",
  };

  const onlineStatusDot: React.CSSProperties = {
    backgroundColor:
      {
        online: "#21B514", // Green for online
        offline: "#808080", // Grey for offline
        absent: "#FFA500", // Orange for absent
        busy: "#FF0000", // Red for busy
      }[task.onlineStatus] || "#FFFFFF",
    position: "absolute",
    height: "0.7rem",
    width: "0.7rem",
    right: "0rem",
    bottom: "0rem",
    borderRadius: "50%",
  };

  const taskName: React.CSSProperties = {
    margin: 0,
    fontWeight: "bold",
    color: "white",
    fontSize: "80%",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    width: "85%",
  };

  const taskStatus: React.CSSProperties = {
    margin: 0,
    fontSize: "70%",
    color: "#B4B4B4",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    width: "85%",
  };

  return (
    <div style={ttContainer}>
      <div style={taskContainer} onClick={onClick}>
        <div style={imageContainer}>
          <img
            src={task.pfp}
            alt={`${task.name}'s profile picture`}
            style={taskImg}
          />
          <div style={onlineStatusDot}></div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "75%",
          }}
        >
          <h3 style={taskName}>{task.name}</h3>
          <p style={taskStatus}>{task.status}</p>
        </div>
      </div>
      <InvertedRadius style={transitionStyle} />
    </div>
  );
};

export default Task;
