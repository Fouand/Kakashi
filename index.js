const Discord = require('discord.js');
const client = new Discord.Client();
const config = require ('./config.json');
const ytdl = require('ytdl-core');
const YouTube = require('simple-youtube-api');
const youtube = new YouTube(config.googleApiKey);

const queue = new Map();

let embed = new Discord.RichEmbed()

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('k!help');
});

client.on('warn', console.warn);
client.on('error', console.error);
client.on('ready', () => console.log('Ready'));
client.on('disconnect', () => console.log('Disconnected'));
client.on('reconnecting', () => console.log('Reconnecting'));

client.on('message', async msg => {
  if (msg.author.bot) return;
  if(!msg.content.startsWith(config.prefix)) return;

  const args = msg.content.split(" ");
  const searchString = args.slice(1).join(' ');
  const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
  const serverQueue = queue.get(msg.guild.id);

  let command = msg.content.toLowerCase().split(' ')[0];
  command = command.slice(config.prefix.length);

  if (command === "play") {
    const voiceChannel = msg.member.voiceChannel;
    if (!voiceChannel) { msg.reply('Зайдите в голосовой канал!'); return; }
    const permissions = voiceChannel.permissionsFor(msg.client.user);
    if (!permissions.has('CONNECT')) {
      msg.reply('Я не могу подключится к этому голосовому каналу!');
      return;
    }
    if (!permissions.has('SPEAK')) {
      msg.reply('Я не могу говорить в этом голосовом канале!');
      return;
    }

    try {
      var video = await youtube.getVideo(url);
    } catch (error) {
      try {
        var videos = await youtube.searchVideos(searchString, 10);
        let index = 0;
        msg.channel.send('**__Выбор песни: __** \n' + '```' + videos.map(vid => ++index + ' - ' + vid.title).join('\n') + '```');
        try {
          var response = await msg.channel.awaitMessages(msgg => msgg.content > 0 && msgg.content < 11, {
            maxMatches: 1,
            time: 10000,
            errors: ['time']
          });
        } catch (error) {
          console.error(error);
          msg.channel.send('Не было выбрано значение от 0 до 10, отмена выбора песни.');
          return;
        }
        const videoIndex = parseInt(response.first().content);
        var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
      } catch (error) {
        msg.channel.send('Видео не найдено.');
        console.error(error);
        return;
      }
    }

    var videoUrl = 'https://www.youtube.com/watch?v=' + video.id;
    const song = {
      id: video.id,
      title: video.title,
      url: videoUrl
    };
    songTitle = song.title;
    if(!serverQueue) {
      const queueConstruct = {
        textChannel: msg.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        volume: 5,
        playing: true,
        isLoop: false
      };
      queue.set(msg.guild.id, queueConstruct);
      queueConstruct.songs.push(song);
      try {
        var connection = await voiceChannel.join();
        queueConstruct.connection = connection;
        msg.channel.send('**' + songTitle + '** добавлено в очередь.');
        play(msg.guild, queueConstruct.songs[0]);
      } catch (error) {
        console.error(error);
        msg.channel.send("Произошла ошибка.");
        queue.delete(msg.guild.id);
        return;
      }
    } else {
      serverQueue.songs.push(song);
      serverQueue.textChannel.send('**' + songTitle + '** добавлено в очередь.');
    }
    return;
  } else if (command === "leave" || command === "stop") {
      const voiceChannel = msg.member.voiceChannel;
      if (!voiceChannel) { msg.reply('Зайдите в голосовой канал!'); return; }
      serverQueue.songs = [];
      serverQueue.isLoop = false;
      serverQueue.playing = true;
      serverQueue.connection.dispatcher.end();
      voiceChannel.leave();
      msg.reply('Выхожу.');
      return;
  } else if (command === "skip" || command === "next") {
    if (serverQueue) {
      if (serverQueue.isLoop === true) { msg.channel.send('Вы не можете скипнуть песню на повторе!'); return; }
      serverQueue.textChannel.send('Скипнуто **' + serverQueue.songs[0].title + '**');
      try {
        serverQueue.textChannel.send('Сейчас играет **' + serverQueue.songs[1].title + '**');
      } catch (error) {}
      serverQueue.connection.dispatcher.end();
      return;
      } else {
        msg.channel.send("Нечего скипать.");
        return;
      }
  } else if (command === "np" || command === "now" || command === "nowplaying") {
    if (!serverQueue) { msg.channel.send('Сейчас ничего не играет!'); return; }
    msg.channel.send('Сейчас играет: **' + serverQueue.songs[0].title + '**');
    return;
  } else if (command === "volume" || command === "vol") {
    const voiceChannel = msg.member.voiceChannel;
    if (!serverQueue) { msg.channel.send('Сейчас ничего не играет!'); return; }
    if (!voiceChannel) { msg.channel.send('Вы не в голосовом канале!'); return; }
    if (!args[1]) { msg.channel.send('Громкость: ' + serverQueue.volume); return; }
    if (args[1] > 1000) { 
      serverQueue.connection.dispatcher.setVolumeLogarithmic(1000 / 5);
      serverQueue.volume = 1000;
      msg.channel.send('Громкость изменена на: ' + serverQueue.volume);
      return;
    }
    serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
    serverQueue.volume = args[1];
    msg.channel.send('Громкость изменена на: ' + serverQueue.volume);
    return;
  } else if (command === "queue") {
    if (!serverQueue) { msg.channel.send('Сейчас ничего не играет!'); return; }
    msg.channel.send(`**__Очередь: __**` + '```' + `\n ${serverQueue.songs.map(song => `- ${song.title}`).join('\n')}` + '```');
  } else if (command === "pause") {
      if (serverQueue && serverQueue.playing) {
      serverQueue.playing = false;
      serverQueue.connection.dispatcher.pause();
      msg.channel.send('Поставлено на паузу');
      return;
    }
    msg.channel.send('Невозможно поставить на паузу!');
    return;
  } else if (command === "resume") {
    if (serverQueue && !serverQueue.playing) {
      serverQueue.playing = true;
      serverQueue.connection.dispatcher.resume();
      msg.channel.send('Воспроизведение музыки');
      return;
    }
    msg.channel.send('Невозможно воспроизвести музыку!');
    return;
  } else if (command === "help") {
    embed.setColor("#FFFF00")
    embed.setTitle("Список моих команд:")
    embed.setDescription("Список команд: k!commands")
    msg.channel.send(embed)

  
  } else if (command === "commands" || command === "cmds") {
    embed.setColor("#00FFFF")
    embed.setTitle("Список моих команд:")
    embed.setDescription(" \n k!help - Помощь \n k!commands(cmds) - Список команд \n k!play - Добавить песню в очередь \n k!pause - Поставить песню на паузу \n k!resume - Воспроизвести песню \n k!queue - Показать очередь песен \n k!skip - Пропустить песню \n k!volume - Изменить громкость \n k!np - Название песни которая сейчас играет \n k!loop - Повтор песни \n k!stop - Закончить воспроизведение")
    msg.channel.send(embed)
  } else if (command === "repeat" || command === "loop") {
    if (serverQueue.isLoop === false) {
      serverQueue.isLoop = true;
      msg.channel.send("Повтор песни: **" + serverQueue.songs[0].title + "**");
    } else {
      serverQueue.isLoop = false;
      msg.channel.send("Прекращаю повтор песни: **" + serverQueue.songs[0].title + "**");
    }
  } else if (command === "ping") {
    msg.channel.send("pong");
  }
});

function play(guild, song) {
  const serverQueue = queue.get(guild.id);

  if(!song) {
    serverQueue.voiceChannel.leave();
    queue.delete(guild.id);
    return;
  }

  const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
      .on('end', () => {
        console.log('Закончилась еба');
        if (serverQueue.isLoop === false) {
          serverQueue.songs.shift();
        }
        setTimeout(function() {
          play(guild, serverQueue.songs[0]);
        }, 500);
      })
      .on('error', error => console.error(error));
  dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
}

client.login(process.env.token);
