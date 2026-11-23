
const PROJECTS = {
  portfolio: [
    "https://subhankar-guha-portfolio.netlify.app/"
  ]

  // shopmate: [
  //   "https://YOUR-SHOPMATE.netlify.app"
  // ],

  // "travel-day": [
  //   "https://YOUR-TRAVEL-DAY.netlify.app"
  // ]
};

const API_VERSION = "2022-11-28";
const STORAGE_BRANCH = "counter-data";

function response(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin || "null",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin"
    }
  });
}

const delay = (ms) =>
  new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(request) {
  const url = new URL(request.url);
  const site = url.searchParams.get("site");
  const origin = request.headers.get("origin");

  const allowedOrigins = PROJECTS[site];

  // Only registered websites can use their counter.
  if (!allowedOrigins || !origin || !allowedOrigins.includes(origin)) {
    return response(
      { error: "Website not authorized" },
      403,
      origin
    );
  }

  if (request.method === "OPTIONS") {
    return response({ success: true }, 200, origin);
  }

  if (request.method !== "GET") {
    return response(
      { error: "Method not allowed" },
      405,
      origin
    );
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return response(
      { error: "Server configuration missing" },
      500,
      origin
    );
  }

  const filePath = `data/${site}.json`;

  const apiUrl =
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION
  };

  try {
    // Retry if another visitor changes the file simultaneously.
    for (let attempt = 0; attempt < 5; attempt++) {

      // Step 1: Read existing counter.
      const readResponse = await fetch(
        `${apiUrl}?ref=${STORAGE_BRANCH}`,
        { headers, cache: "no-store" }
      );

      let views = 0;
      let sha = null;

      if (readResponse.ok) {
        const file = await readResponse.json();

        sha = file.sha;

        const decoded = Buffer.from(
          file.content,
          "base64"
        ).toString("utf8");

        const savedData = JSON.parse(decoded);

        if (
          !Number.isSafeInteger(savedData.views) ||
          savedData.views < 0
        ) {
          throw new Error("Invalid counter data");
        }

        views = savedData.views;

      } else if (readResponse.status !== 404) {
        throw new Error(
          `GitHub read failed: ${readResponse.status}`
        );
      }

      // Step 2: Increment count.
      views++;

      const updatedData = {
        project: site,
        views,
        lastUpdated: new Date().toISOString()
      };

      const content = Buffer.from(
        JSON.stringify(updatedData, null, 2)
      ).toString("base64");

      // Step 3: Commit the new count to GitHub.
      const writeResponse = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Update ${site} views: ${views}`,
          content,
          branch: STORAGE_BRANCH,
          ...(sha ? { sha } : {})
        })
      });

      if (writeResponse.ok) {
        return response(
          {
            success: true,
            project: site,
            views,
            lastUpdated: updatedData.lastUpdated
          },
          200,
          origin
        );
      }

      // Retry if GitHub reports a concurrent update conflict.
      if (
        writeResponse.status === 409 ||
        writeResponse.status === 422
      ) {
        await delay(200 * (attempt + 1));
        continue;
      }

      const errorText = await writeResponse.text();

      console.error("GitHub error:", errorText);

      throw new Error(
        `GitHub update failed: ${writeResponse.status}`
      );
    }

    return response(
      { error: "Too many simultaneous updates. Please retry." },
      503,
      origin
    );

  } catch (error) {
    console.error("SubhoView:", error);

    return response(
      { error: "Counter update failed" },
      502,
      origin
    );
  }
}
