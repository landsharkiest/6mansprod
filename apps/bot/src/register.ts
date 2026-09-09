import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/index.js';

/**
 * Registers the bot's slash commands with Discord. Guild-scoped (near-instant) when GUILD_ID is
 * set — handy while developing — otherwise global, which can take up to an hour to propagate.
 * Re-run this any time a command's name, description, or options change.
 */
async function main(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);
  const body = commands.map((command) => command.data.toJSON());

  const route = config.GUILD_ID
    ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.GUILD_ID)
    : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

  await rest.put(route, { body });
  const scope = config.GUILD_ID ? `guild ${config.GUILD_ID}` : 'globally';
  console.log(`Registered ${body.length} command(s) ${scope}: ${body.map((c) => c.name).join(', ')}`);
}

main().catch((err) => {
  console.error('Failed to register commands', err);
  process.exit(1);
});
