const { InteractionType, InteractionResponseType, verifyKey } = require('discord-interactions');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async (req, res) => {
    // 1. SECURITY: Verify the request is actually from Discord
    // We must use the raw body for signature verification
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    
    // Vercel parses req.body automatically. For verifyKey, we need the string version.
    const rawBody = JSON.stringify(req.body);

    const isValidRequest = verifyKey(
        rawBody,
        signature,
        timestamp,
        process.env.DISCORD_PUBLIC_KEY
    );

    if (!isValidRequest) {
        return res.status(401).send('Bad request signature');
    }

    const interaction = req.body;

    // 2. PING: Discord checking if your URL is alive (Verification step)
    if (interaction.type === InteractionType.PING) {
        return res.send({
            type: InteractionResponseType.PONG,
        });
    }

    // 3. MODAL SUBMIT: The Logic for saving the note
    if (interaction.type === InteractionType.MODAL_SUBMIT) {
        try {
            const rawData = interaction.data.components[0].components[0].value;
            const message = interaction.data.components[1].components[0].value;
            
            // Expected format from Udon: "x|y|z|hash"
            const [x, y, z, hash] = rawData.split('|');

            // Save to Supabase
            await supabase.from('notes').upsert({
                discord_id: interaction.member.user.id,
                username: interaction.member.user.username,
                pos_x: parseFloat(x),
                pos_y: parseFloat(y),
                pos_z: parseFloat(z),
                message: message
            });

            // Fetch all notes to update the Gist for VRChat
            const { data: allNotes, error: fetchError } = await supabase
                .from('notes')
                .select('*');

            if (allNotes) {
                // Update GitHub Gist
                await axios.patch(
                    `https://api.github.com/gists/${process.env.GIST_ID}`,
                    {
                        files: {
                            "notes.json": {
                                content: JSON.stringify(allNotes)
                            }
                        }
                    },
                    {
                        headers: {
                            Authorization: `token ${process.env.GITHUB_TOKEN}`,
                            Accept: "application/vnd.github.v3+json"
                        }
                    }
                );
            }

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: "✅ Note saved! It will appear in the VRChat world shortly.",
                    flags: 64 // Ephemeral: Only the user who sent it sees this
                }
            });

        } catch (error) {
            console.error("Error processing modal:", error);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: "❌ Error saving note. Please try again.",
                    flags: 64
                }
            });
        }
    }
};
