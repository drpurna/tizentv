const items = ["Home", "Live TV", "Favorites", "Settings"];

export default function Sidebar() {
  return (
    <div style={{ width: 200, padding: 20 }}>
      {items.map((i, idx) => (
        <div key={idx} style={{ margin: 20 }}>
          {i}
        </div>
      ))}
    </div>
  );
}
