export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "pg-porttycoon",
      path: new URL(request.url).pathname,
    });
  },
};
