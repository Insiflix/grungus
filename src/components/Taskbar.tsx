import React, { useState, useEffect } from "react";

interface Task {
  id: string;
  pfp: string;
  name: string;
  status: string;
  onlineStatus: string;
}

interface TaskbarProps {
  taskIds: string[];
  selectedTaskIndex: number | null;
  onSelectTask: (index: number) => void;
}

const fallbackData: Task = {
  id: "fallback",
  pfp: "https://picsum.photos/200",
  name: "Ritalin Royale Käse",
  status: "Krabben Koitus",
  onlineStatus: "online",
};

const Taskbar: React.FC<TaskbarProps> = ({ taskIds, selectedTaskIndex, onSelectTask }) => {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const fetchedTasks = await Promise.all(
          taskIds.map(async (id) => {
            const url = `http://localhost/api/${id}`;
            const response = await fetch(url);
            const data: Task = await response.json();
            return data;
          })
        );
        setTasks(fetchedTasks);
      } catch (error) {
        console.error("Failed to fetch task data:", error);
        setTasks(Array(taskIds.length).fill(fallbackData));
      }
    };

    fetchTasks();
  }, [taskIds]);

  const taskbarStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    width: "100%",
    WebkitFlexDirection: "row", // -webkit- variant
  };

  const ttContainer: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    WebkitFlexDirection: "column", // -webkit- variant
    WebkitAlignItems: "center", // -webkit- variant
  };

  const taskContainerStyle = (selected: boolean): React.CSSProperties => ({
    display: "flex",
    position: "relative",
    margin: "0 0 0 0",
    padding: "0.5rem",
    width: "11.9vw",
    alignItems: "center",
    backgroundColor: "rgba(148, 148, 148, 0.25)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    cursor: "pointer",
    border: selected ? "1px solid #9E9E9E" : "0px",
    borderTopLeftRadius: "10px",
    borderTopRightRadius: "10px",
    borderBottomLeftRadius: selected ? "0px" : "10px",
    borderBottomRightRadius: selected ? "0px" : "10px",
    transform: selected ? "scale(1.05)" : "scale(1)",
    transition: "transform 0.3s ease",
    WebkitTransform: selected ? "scale(1.05)" : "scale(1)", // -webkit- variant
    WebkitTransition: "transform 0.3s ease", // -webkit- variant
    WebkitAlignItems: "center", // -webkit- variant
    WebkitBorderTopLeftRadius: "10px", // -webkit- variant
    WebkitBorderTopRightRadius: "10px", // -webkit- variant
    WebkitBorderBottomLeftRadius: selected ? "0px" : "10px", // -webkit- variant
    WebkitBorderBottomRightRadius: selected ? "0px" : "10px", // -webkit- variant
  });

  const innerTaskStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    width: "75%",
    WebkitFlexDirection: "column", // -webkit- variant
    WebkitJustifyContent: "center", // -webkit- variant
  };

  const imageContainer: React.CSSProperties = {
    display: "block",
    position: "relative",
    marginRight: "0.5rem",
    WebkitMarginEnd: "0.5rem", // -webkit- variant
  };

  const taskImg: React.CSSProperties = {
    display: "block",
    position: "relative",
    width: "2.4rem",
    height: "2.4rem",
    minWidth: "2.4rem",
    borderRadius: "45px",
    WebkitBorderRadius: "45px", // -webkit- variant
  };

  const onlineStatusDot = (onlineStatus: string): React.CSSProperties => ({
    position: "absolute",
    right: "0rem",
    bottom: "0rem",
    width: "0.7rem",
    height: "0.7rem",
    borderRadius: "50%",
    backgroundColor:
      {
        online: "#21B514", // Green for online
        offline: "#808080", // Grey for offline
        absent: "#FFA500", // Orange for absent
        busy: "#FF0000", // Red for busy
      }[onlineStatus] || "#FFFFFF",
    WebkitBorderRadius: "50%", // -webkit- variant
  });

  const taskName: React.CSSProperties = {
    display: "block",
    position: "relative",
    margin: 0,
    width: "85%",
    fontWeight: "bold",
    fontSize: "80%",
    color: "white",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    WebkitFontSmoothing: "antialiased", // -webkit- variant
    WebkitUserSelect: "none", // -webkit- variant
  };

  const taskStatus: React.CSSProperties = {
    display: "block",
    position: "relative",
    margin: 0,
    width: "85%",
    fontSize: "70%",
    color: "#B4B4B4",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    WebkitFontSmoothing: "antialiased", // -webkit- variant
    WebkitUserSelect: "none", // -webkit- variant
  };

  const connectorStyle: React.CSSProperties = {
    display: "block",
    position: "relative",
    width: "12.9vw",
    height: "0.7rem",
    margin: "0.05rem 0 0 0",
    backgroundColor: "rgba(148, 148, 148, 0.25)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "1px solid #9E9E9E",
    borderTopLeftRadius: "10px",
    borderTopRightRadius: "10px",
    transition: "transform 0.3s ease",
    WebkitBorderTopLeftRadius: "10px", // -webkit- variant
    WebkitBorderTopRightRadius: "10px", // -webkit- variant
    WebkitTransition: "transform 0.3s ease", // -webkit- variant
    WebkitTransform: "scale(1)", // -webkit- variant
  };

  return (
    <div style={taskbarStyle}>
      {tasks.map((task, index) => (
        <div
          key={task.id}
          style={ttContainer}
          onClick={() => onSelectTask(index)}
        >
          <div style={taskContainerStyle(selectedTaskIndex === index)}>
            <div style={imageContainer}>
              <img
                src={task.pfp}
                alt={`${task.name}'s profile picture`}
                style={taskImg}
              />
              <div style={onlineStatusDot(task.onlineStatus)}></div>
            </div>
            <div style={innerTaskStyle}>
              <h3 style={taskName}>{task.name}</h3>
              <p style={taskStatus}>{task.status}</p>
            </div>
          </div>
          <div style={{ ...connectorStyle, visibility: selectedTaskIndex === index ? "visible" : "hidden" }} />
        </div>
      ))}
    </div>
  );
};

export default Taskbar;
