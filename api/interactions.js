const { InteractionType, InteractionResponseType, verifyKey } = require('discord-interactions');
const { createClient } = require('sb'); // This matches the 'sb' alias in package.json
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async (req, res) => {
    // 1. SECURITY: Verify the request is actually from Discord
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    const isValidRequest = verifyKey(JSON.stringify(req.body), signature, timestamp, process.env.DISCORD_PUBLIC_KEY);

    if (!isValidRequest) return res.status(401).send('Bad request signature');

    const interaction = req.body;

    // 2. PING: Discord checking if your URL is alive
    if (interaction.type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
    }

    // 3. MODAL SUBMIT: The Logic
    if (interaction.type === InteractionType.MODAL_SUBMIT) {
        const rawData = interaction.data.components[0].components[0].value;
        const message = interaction.data.components[1].components[0].value;
        const [x, y, z, hash] = rawData.split('|');

        // Logic to verify hash would go here (matching your Udon script)
        
        await supabase.from('notes').upsert({
            discord_id: interaction.member.user.id,
            username: interaction.member.user.username,
            pos_x: parseFloat(x), pos_y: parseFloat(y), pos_z: parseFloat(z),
            message: message
        });

        // Update Gist
        const { data: allNotes } = await supabase.from('notes').select('*');
        await axios.patch(`https://api.github.com/gists/${process.env.GIST_ID}`, 
            { files: { "notes.json": { content: JSON.stringify(allNotes) } } },
            { headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` } }
        );

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "Note saved! Refresh your VRChat world.", flags: 64 }
        });
    }

};

