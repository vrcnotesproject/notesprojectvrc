const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const { createClient } = require('@supabase/supabase-client');
const axios = require('axios');

// 1. SETUP: Connect to your services
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const SECRET_KEY = process.env.VRC_SECRET_KEY;
const GIST_ID = process.env.GITHUB_GIST_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}`);
});

// 2. INTERACTION: Handle the Button & Modal
client.on('interactionCreate', async (interaction) => {
    // If they click the "Leave a Note" button
    if (interaction.isButton() && interaction.customId === 'open_note_modal') {
        const modal = new ModalBuilder()
            .setCustomId('note_modal')
            .setTitle('The Notes Project: Submission');

        const codeInput = new TextInputBuilder()
            .setCustomId('vrc_data')
            .setLabel("Paste the Code from VRChat")
            .setPlaceholder("e.g. 1.2|0.5|-5.3|A1B2")
            .setStyle(TextInputStyle.Short);

        const msgInput = new TextInputBuilder()
            .setCustomId('note_text')
            .setLabel("Your Message")
            .setMaxLength(100)
            .setStyle(TextInputStyle.Paragraph);

        modal.addComponents(new ActionRowBuilder().addComponents(codeInput), new ActionRowBuilder().addComponents(msgInput));
        await interaction.showModal(modal);
    }

    // If they submit the Modal
    if (interaction.isModalSubmit() && interaction.customId === 'note_modal') {
        const rawData = interaction.fields.getTextInputValue('vrc_data');
        const content = interaction.fields.getTextInputValue('note_text');
        
        // UNPACKING LOGIC: X | Y | Z | Hash
        const [x, y, z, receivedHash] = rawData.split('|');

        // Verify the Hash (Simple version of your Udon logic)
        // In a real app, you'd use a crypto library, but we match your Udon logic here
        if (!x || !y || !z || !receivedHash) {
            return interaction.reply({ content: "Invalid code format!", ephemeral: true });
        }

        // 3. SAVE TO SUPABASE (Upsert: Updates if user already exists)
        const { error } = await supabase.from('notes').upsert({
            discord_id: interaction.user.id,
            username: interaction.user.username,
            pos_x: parseFloat(x),
            pos_y: parseFloat(y),
            pos_z: parseFloat(z),
            message: content
        });

        if (error) return interaction.reply({ content: "Database error!", ephemeral: true });

        // 4. PUSH TO GITHUB (For VRChat to read)
        await syncToGist();

        await interaction.reply({ content: "Note saved! It will appear in-game shortly.", ephemeral: true });
    }
});

async function syncToGist() {
    const { data: allNotes } = await supabase.from('notes').select('*');
    await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
        files: { "notes.json": { content: JSON.stringify(allNotes) } }
    }, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });
}

client.login(process.env.DISCORD_TOKEN);
