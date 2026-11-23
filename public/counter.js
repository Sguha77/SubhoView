
(() => {
  const API =
    "https://YOUR-SUBHOVIEW.netlify.app/.netlify/functions/views";

  const elements = document.querySelectorAll("[data-subhoview]");

  // Group all display elements by project ID.
  const projects = new Map();

  elements.forEach(element => {
    const id = element.dataset.subhoview;

    if (!projects.has(id)) {
      projects.set(id, []);
    }

    projects.get(id).push(element);
  });

  // Count each project only once per script execution.
  projects.forEach(async (nodes, id) => {
    nodes.forEach(node => {
      node.textContent = "Loading...";
    });

    try {
      const response = await fetch(
        `${API}?site=${encodeURIComponent(id)}`,
        {
          method: "GET",
          cache: "no-store"
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Counter unavailable");
      }

      nodes.forEach(node => {
        node.textContent = Number(data.views).toLocaleString("en-IN");
      });

    } catch (error) {
      console.error("SubhoView error:", error);

      nodes.forEach(node => {
        node.textContent = "Unavailable";
      });
    }
  });
})();
