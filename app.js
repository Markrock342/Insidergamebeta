const express = require('express');
const app = express();

var server = require('http').createServer(app), // เซิร์ฟเวอร์ HTTP
    io = require('socket.io').listen(server), // Socket.io สำหรับการทำงานแบบเรียลไทม์
    ent = require('ent'), // Ent สำหรับการเข้ารหัส
    session = require('express-session'),
    FileStore = require('session-file-store')(session), // เพิ่ม FileStore สำหรับการจัดเก็บ session
    bodyParser = require('body-parser'),
    expressLayouts = require('express-ejs-layouts');

const fs = require('fs');

// อ่านไฟล์ famille.csv และแยกคำศัพท์
const wordFamille = fs.readFileSync('words/famille.csv', 'utf8').split(/\r?\n/),
      gameMasterRole = 'ผู้นำ',
      traitorRole = 'จอมบงการ',
      defaultRole = 'พลเมือง';

app.use(function(req, res, next){
    if (typeof(game) == 'undefined') {
        game = {
            players: [
                {name: 'ผู้เล่น1', role: '', vote1: null, vote2: null, nbVote2: 0, isGhost: false, permission: null},
                {name: 'ผู้เล่น2', role: '', vote1: null, vote2: null, nbVote2: 0, isGhost: false, permission: null},
                {name: 'ผู้เล่น3', role: '', vote1: null, vote2: null, nbVote2: 0, isGhost: false, permission: null},
                {name: 'ผู้เล่น4', role: '', vote1: null, vote2: null, nbVote2: 0, isGhost: false, permission: null},
                {name: 'ผู้นำ', role: '', vote1: null, vote2: null, nbVote2: 0, isGhost: false, permission: 'admin'},
            ],
            online: 0,
            settings: { traitorOptional: true },
            resultVote1: null,
            resultVote2: null
        };
    }
    next();
})

.use(expressLayouts)
.use(session({
    store: new FileStore(), // ใช้ FileStore สำหรับจัดเก็บ session
    secret: 'session-insider-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // อายุของ session (1 ชั่วโมง)
}))
.use('/static', express.static(__dirname + '/public'))
.use(bodyParser.urlencoded({
   extended: true
}))
.set('view engine', 'ejs')
.set('layout', 'layouts/layout')
.set('view engine', 'ejs')
.get('/', function (req, res) {
    res.render('welcome.ejs', {players: game.players.filter((player) => !isGhostPlayer(player))});
})
.get('/adminPlayer', function (req, res) {
    res.render('adminPlayer.ejs', {players: game.players});
})
.get('/deletePlayer', function (req, res) {
    game.players.forEach(function(playerItem, index) {
        if(playerItem.name == req.query.player) {
            game.players.splice(index, 1);
        }
    });
    res.redirect('/adminPlayer');
})
.post('/addPlayer', function (req, res) {
    console.log(req.body.admin);
    game.players.push(
        {name: req.body.player, role: '', vote1: null, vote2: null, nbVote2: 0, isGhost: false, permission: (req.body.admin === 'on' ? 'admin' : null) },
    );
    res.redirect('/adminPlayer');
})
.post('/setWord', function (req, res) {
    if(req.body.word !== '') {
        game.word = req.body.word;
    }
    res.json('ok');
})
.post('/game', function (req, res) {    
    req.session.player = req.body.player;
    res.redirect('/game');
})
.get('/game', function (req, res) {
    if(!req.session.player) {
        res.redirect('/');
    }
    me = game.players.filter((player) => player.name === req.session.player );

    res.render('board.ejs', { player: me[0], status: game.status, resultVote1: game.resultVote1, resultVote2: game.resultVote2 });
})
function resetGame() {
    removeGhostPlayer();
    game.players.forEach(function(player, index) {
        player.role = defaultRole;
        player.vote1 = null;
        player.vote2 = null;
        player.nbVote2 = 0;
    });
    game.word = getWord(wordFamille);
    game.countdown = null;
    game.resultVote1 = null;
    game.resultVote2 = null;
    game.status = '';
}
function randomRoles(players) {
    resetGame();
    players = shuffle(players);
    setRole(gameMasterRole);
    players = shuffle(players);
    players = addGhostPlayer();
    players = shuffle(players);
    setRole(traitorRole);

    players.sort(comparePlayer);
    
    return players;
}
function comparePlayer(a, b) {
    if (a.isGhost) {
       return 1;
    } else if (a.name > b.name) {
        return 0;
    }
    return -1;
}
function setRole(role) {
    game.players.some(function(player) {
        if(player.role === defaultRole) {
            player.role = role;
            return true;
        }
    });
}
function shuffle(players) {
    let ctr = players.length;
    let temp;
    let index;
    while (ctr > 0) {
        index = Math.floor(Math.random() * ctr);
        ctr--;
        temp = players[ctr];
        players[ctr] = players[index];
        players[index] = temp;
    }
    return players;
}
function addGhostPlayer() {
    if(game.settings.traitorOptional) {
        game.players.push({name: 'Pas de Traître', role: defaultRole, vote1: null, vote2: null, nbVote2: 0, isGhost: true, permission: null});
    }
    return game.players;
}
function removeGhostPlayer() {
    game.players = game.players.filter((player) => !isGhostPlayer(player) );
}
function getGhostPlayer() {
    ghostPlayer = game.players.filter(isGhostPlayer);
    return ghostPlayer.length > 0 ? ghostPlayer[0] : null;
}
function getWord(wordList) {
    return wordList[Math.floor(Math.random() * wordList.length)];
}
function everybodyHasVoted(voteNumber) {
    const hasVoted1 = (currentValue) => currentValue.isGhost || currentValue.vote1 !== null;
    const hasVoted2 = (currentValue) => currentValue.isGhost || currentValue.vote2 !== null;
    if(voteNumber == 1) {
        return game.players.every(hasVoted1);
    } else {
        return game.players.every(hasVoted2);
    }
}
function resetVote(voteNumber) {
    game.players.map(function(player) {
        if(voteNumber === 1) {
            player.vote1 = null;
        } else {
            player.vote2 = null;
        }
    });
}
function isNotGameMaster(player) {
    return player.role !== gameMasterRole;
}
function isGhostPlayer(player) {
    return player.isGhost;
}
function addPlayerVote2(playerVote) {

    game.players.map(function(player) {
        if(playerVote === player.name) {
            player.nbVote2 += 1;
        }
    });
}
function compareVote(a, b) {
  if (a.nbVote2 < b.nbVote2) return 1;
  if (b.nbVote2 < a.nbVote2) return -1;
  return 0;
}
function processVote1Result() {
    voteResult = {'up': 0, 'down': 0};
    game.players.some(function(player) {
      if(player.vote1 == '1') {
        voteResult.up += 1;
      } else if(!isGhostPlayer(player)) {
        voteResult.down += 1;
      }
    });
    game.resultVote1 = voteResult;
}
function processVote2Result() {
    game.players.forEach(function(player, index) {
        addPlayerVote2(player.vote2);
    });
    votePlayers = game.players.filter(isNotGameMaster);
    votePlayers.sort(compareVote);
    hasWon = votePlayers[0].role === traitorRole && votePlayers[1].nbVote2 < votePlayers[0].nbVote2;
    ghostPlayers = game.players.filter(isGhostPlayer);
    ghostPlayer = ghostPlayers.length > 0 ? ghostPlayers[0]: null;
    game.resultVote2 = { hasWon: hasWon, voteDetail: votePlayers, hasTraitor: (!ghostPlayer || ghostPlayer.role !== traitorRole) };
}

io.sockets.on('connection', function (socket) {
    socket.join('game');
 
    socket.on('newPlayer', function(data1) {
        game.online = game.online + 1;
        humanPlayers = game.players.filter((player) => !isGhostPlayer(player) );
        offline = humanPlayers.length - game.online;
        console.log('Online players : ' + game.online);
        console.log('New player connected : ' + data1);
        io.in('game').emit('playerStatusUpdate', { online: game.online, offline: offline });
    });
    socket.on('disconnect', function () {
      console.log('Player disconnected');
      game.online = game.online > 0 ? game.online - 1 : 0;
      humanPlayers = game.players.filter((player) => !isGhostPlayer(player) );
      offline = humanPlayers.length - game.online;
      io.in('game').emit('playerStatusUpdate', { online: game.online, offline: offline });
    });
    socket.on('resetGame', function (object) {
        if (game.countdown !== null) {
            clearInterval(game.countdown);
        }
        game.players = randomRoles(game.players);
        game.word = getWord(wordFamille);
        io.in('game').emit('newRole', { players: game.players });
        game.status = 'role';
    });
    socket.on('revealWord', function (object) {
        io.in('game').emit('revealWord', { players: game.players , word: game.word });
        game.status = 'word';
    });
    socket.on('wordFound', function (object) {
        if (game.countdown !== null) {
            clearInterval(game.countdown);
        }
        io.in('game').emit('wordFound');
        game.status = 'vote1';
    });
    socket.on('displayVote1', function (object) {
        resetVote(1);
        io.in('game').emit('displayVote1');
        game.status = 'vote1';
    });
    socket.on('displayVote2', function () {
        resetVote(2);
        io.in('game').emit('displayVote2', game.players.filter(isNotGameMaster));
        game.status = 'vote2';
    });
    socket.on('vote1', function (object) {
        game.players.map(function(player) {
            if(object.player === player.name) {
                player.vote1 = object.vote;
            }
        });
        if(everybodyHasVoted(1)) {
            processVote1Result();
            io.in('game').emit('vote1Ended', game.resultVote1);
            game.status = 'vote2';
        }
    });
    socket.on('vote2', function (object) {
        game.players.map(function(player) {
            if(object.player === player.name) {
                player.vote2 = object.vote;
            }
        });
        if(everybodyHasVoted(2)) {
            processVote2Result();
            io.in('game').emit('vote2Ended', game.resultVote2);
            game.status = 'end';
        }
    });
    socket.on('startGame', function (object) {
        let counter = 300;
        if (game.countdown !== null) {
            clearInterval(game.countdown);
        }
        game.countdown = setInterval(function(){
            counter--
            if (counter === 0) {
              clearInterval(this);
            }
            io.in('game').emit('countdownUpdate', counter);
        }, 1000);
        io.in('game').emit('startGame', {});
        game.status = 'in_progress';
    });
})
 
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

