const { InteractionType, InteractionResponseType, verifyKey } = require('discord-interactions');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Helper to get raw body in CommonJS
const getRawBody = (req) => {
    return new Promise((resolve, reject) => {
        let bodyChunks = [];
        req.on('data', (chunk) => bodyChunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(bodyChunks).toString()));
        req.on('error', reject);
    });
};

module.exports = async (req, res) => {
    // 1. We MUST get the body BEFORE any parsing happens
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    
    // Get the actual string sent by Discord
    const body = await getRawBody(req);

    // 2. Verify the Signature
    const isValidRequest = verifyKey(
        body,
        signature,
        timestamp,
        process.env.DISCORD_PUBLIC_KEY
    );

    if (!isValidRequest) {
        console.error("Signature Verification Failed");
        return res.status(401).send('Invalid request signature');
    }

    // 3. Parse the body to handle the logic
    const interaction = JSON.parse(body);

    // 4. Handle PING (Discord Verification)
    if (interaction.type === InteractionType.PING) {
        return res.send({
            type: InteractionResponseType.PONG,
        });
    }

    // 5. Handle MODAL_SUBMIT
    if (interaction.type === InteractionType.MODAL_SUBMIT) {
        try {
            const rawData = interaction.data.components[0].components[0].value;
            const message = interaction.data.components[1].components[0].value;
            const [x, y, z, hash] = rawData.split('|');

            // Save to Supabase
            await supabase.from('notes').upsert({
                discord_id: interaction.member.user.id,
                username: interaction.member.user.username,
                pos_x: parseFloat(x), pos_y: parseFloat(y), pos_z: parseFloat(z),
                message: message
            });

            // Update Gist for VRChat
            const { data: allNotes } = await supabase.from('notes').select('*');
            await axios.patch(`https://api.github.com/gists/${process.env.GIST_ID}`, 
                { files: { "notes.json": { content: JSON.stringify(allNotes) } } },
                { headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` } }
            );

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: "✅ Note saved!", flags: 64 }
            });
        } catch (err) {
            console.error("Logic Error:", err);
            return res.status(500).send("Internal Server Error");
        }
    }
};
