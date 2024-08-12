import { useState, useEffect } from "react";
import { HiOutlineX } from "react-icons/hi";

interface Task {
  pfp: string;
  name: string;
  status: string;
  onlineStatus: string;
}

interface TaskID {
  id: string;
}

const testData: Task = {
  pfp: "https://picsum.photos/200",
  name: "Ritalin Royale Käse",
  status: "Krabben Koitus",
  onlineStatus: "online",
};

const Task = ({ id }: TaskID) => {
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
    margin: "0 0 0 0.7rem",
    display: "flex",
    borderRadius: "10px",
    backgroundColor: "rgba(148, 148, 148, 0.25)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    width: "11.9vw",
    alignItems: "center",
    padding: "0.5rem",
    cursor: "pointer",
  };

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

  const iconStyle: React.CSSProperties = {
    margin: "0 0 0 auto",
    fontSize: "1rem",
    cursor: "pointer",
  };

  return (
    <div style={taskContainer}>
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
          width: "75%"
        }}
      >
        <h3 style={taskName}>{task.name}</h3>
        <p style={taskStatus}>{task.status}</p>
      </div>
    </div>
  );
};

export default Task;
