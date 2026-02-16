const { InteractionType, InteractionResponseType, verifyKey } = require('discord-interactions');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Vercel Config: This prevents Vercel from messing with the raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper function to read the raw body from the stream
async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  // 1. Get the Raw Body and Headers
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const rawBody = await getRawBody(req);

  // 2. Security Verification
  const isValidRequest = verifyKey(
    rawBody,
    signature,
    timestamp,
    process.env.DISCORD_PUBLIC_KEY
  );

  if (!isValidRequest) {
    console.error("Signature verification failed");
    return res.status(401).send('Invalid request signature');
  }

  // 3. Parse the body now that we've verified it
  const interaction = JSON.parse(rawBody);

  // 4. Handle the PING (The part Discord checks when you hit Save)
  if (interaction.type === InteractionType.PING) {
    return res.status(200).json({
      type: InteractionResponseType.PONG,
    });
  }

  // 5. MODAL SUBMIT: The Logic
  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    try {
      const rawData = interaction.data.components[0].components[0].value;
      const message = interaction.data.components[1].components[0].value;
      const [x, y, z, hash] = rawData.split('|');

      await supabase.from('notes').upsert({
        discord_id: interaction.member.user.id,
        username: interaction.member.user.username,
        pos_x: parseFloat(x), pos_y: parseFloat(y), pos_z: parseFloat(z),
        message: message
      });

      const { data: allNotes } = await supabase.from('notes').select('*');
      await axios.patch(`https://api.github.com/gists/${process.env.GIST_ID}`, 
        { files: { "notes.json": { content: JSON.stringify(allNotes) } } },
        { headers: { 
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github.v3+json"
          } 
        }
      );

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "✅ Note saved! Refresh your VRChat world.", flags: 64 }
      });
    } catch (err) {
      console.error(err);
      return res.status(500).send("Internal Server Error");
    }
  }
}
