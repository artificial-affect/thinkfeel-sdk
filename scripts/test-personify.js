const { ThinkFeel } = require("../dist");

const thinkFeel = new ThinkFeel({
  apiKey: "YOUR_CURVE_API_KEY",
  personaId: "YOUR_CURVE_PERSONA_ID",
  baseUrl: "https://playground.curvelabs.org",
});

async function main() {
  const response = await thinkFeel.personify({
    raw: "This is a placeholder base response. Replace it with the generated text you want rewritten in the persona voice.",
  });

  console.log("Personified:", response.personified);
  console.log("Chunks:", response.chunks);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
