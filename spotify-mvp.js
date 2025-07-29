import express from 'express';
import dotenv from 'dotenv';
import open from 'open';
import SpotifyWebApi from 'spotify-web-api-node';

dotenv.config();

const app = express();
const port = 3001;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

let storedAccessToken = null;
let storedRefreshToken = null;

const refreshAccessTokenIfNeeded = async () => {
  try {
    const data = await spotifyApi.refreshAccessToken();
    const newToken = data.body.access_token;
    spotifyApi.setAccessToken(newToken);
    storedAccessToken = newToken;
    console.log('🔁 Access token actualizado');
  } catch (err) {
    console.error('❌ Error al refrescar el token:', err);
  }
};

const baseStyles = `
  <style>
    body {
      font-family: 'Arial', sans-serif;
      background: #f9f9f9;
      padding: 20px;
      color: #333;
    }
    .search-box {
      max-width: 500px;
      margin: 0 auto 30px;
      display: flex;
      background: #eee;
      border-radius: 50px;
      padding: 10px 20px;
    }
    .search-box input {
      border: none;
      background: transparent;
      flex: 1;
      font-size: 18px;
      outline: none;
    }
    .search-box button {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 18px;
    }
    .track {
      display: flex;
      align-items: center;
      margin-bottom: 20px;
      background: white;
      padding: 10px 15px;
      border-radius: 15px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .track img {
      width: 64px;
      height: 64px;
      border-radius: 10px;
      object-fit: cover;
      margin-right: 15px;
    }
    .track-info {
      flex: 1;
    }
    .track-info .name {
      font-size: 16px;
      font-weight: bold;
    }
    .track-info .artist {
      font-size: 14px;
      color: #666;
    }
    .track form {
      margin: 0;
    }
    .add-button {
      width: 36px;
      height: 36px;
      background: #b44cf3;
      border-radius: 50%;
      border: none;
      color: white;
      font-size: 22px;
      font-weight: bold;
      cursor: pointer;
    }
    a {
      display: inline-block;
      margin-top: 30px;
      color: #888;
      text-decoration: none;
    }
  </style>
`;

app.get('/login', (req, res) => {
  const scopes = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
  ];
  const authUrl = spotifyApi.createAuthorizeURL(scopes, 'noizee-state');
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    const { access_token, refresh_token } = data.body;

    storedAccessToken = access_token;
    storedRefreshToken = refresh_token;

    spotifyApi.setAccessToken(access_token);
    spotifyApi.setRefreshToken(refresh_token);

    res.send(`
      ${baseStyles}
      <div class="search-box">
        <form action="/search" method="get" style="display: flex; width: 100%;">
          <input type="text" name="q" placeholder="Busca una canción" required />
          <button type="submit">🔍</button>
        </form>
      </div>
    `);
  } catch (err) {
    console.error('❌ Error en el callback:', err);
    res.status(400).send('Error en autenticación');
  }
});

app.get('/search', async (req, res) => {
  const { q } = req.query;

  try {
    await refreshAccessTokenIfNeeded();
    spotifyApi.setAccessToken(storedAccessToken);

    const data = await spotifyApi.searchTracks(q);
    const tracks = data.body.tracks.items.slice(0, 5);

    let html = `${baseStyles}<h2>Resultados:</h2>`;

    tracks.forEach((track) => {
      const img = track.album.images[0]?.url || '';
      html += `
        <div class="track">
          <img src="${img}" alt="cover" />
          <div class="track-info">
            <div class="name">${track.name}</div>
            <div class="artist">${track.artists.map(a => a.name).join(', ')}</div>
          </div>
          <form action="/queue" method="post">
            <input type="hidden" name="uri" value="${track.uri}" />
            <button class="add-button" type="submit">+</button>
          </form>
        </div>`;
    });

    html += `<a href="/login">⬅ Volver</a>`;
    res.send(html);
  } catch (err) {
    console.error('❌ Error en búsqueda:', err.body || err);
    res.send('Error buscando canciones');
  }
});

app.post('/queue', async (req, res) => {
  const uri = req.body.uri;

  if (!uri) {
    return res.send('<p>❌ No se recibió ningún URI.</p><a href="/login">Volver</a>');
  }

  try {
    await refreshAccessTokenIfNeeded();
    spotifyApi.setAccessToken(storedAccessToken);

    await spotifyApi.addToQueue(uri);
    res.send(`${baseStyles}<p>✅ ¡Canción añadida a la cola!</p><a href="/login">Volver</a>`);
  } catch (err) {
    console.error('❌ Error al añadir a la cola:', err.body || err);
    res.send(`${baseStyles}<p>❌ Error al añadir a la cola: ${err.message}</p><a href="/login">Volver</a>`);
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor en http://localhost:${port}`);
  open(`${process.env.SPOTIFY_REDIRECT_URI.replace('/callback', '/login')}`);
});
