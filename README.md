[index.js](https://github.com/user-attachments/files/32533638/index.js)[Uploading index.js[modules-v1.json](https://github.com/user-attachments/files/32533645/modules-v1.json)…]()
{
  "contractVersion": 3,
  "releaseTrack": "stable",
  "contentType": "music",
  "moduleVersion": "1.3.0",
  "moduleFamilyId": "synthetiq_music_hub",
  "moduleIdentity": "SP-MUS-3005-MUSIC-HUB",
  "moduleIdentityNumber": 3005,
  "config": {
    "runtime": {
      "entry": "index.js",
      "mode": "local"
    },
    "caps": {
      "homeMaxResults": 50,
      "maxResponseBytes": 10485760,
      "timeoutMs": 30000,
      "maxConcurrentRequests": 3
    }
  },
  "configuration": {
    "fields": [
      {
        "key": "audiusApiKey",
        "type": "secret",
        "title": "Audius API Key (optional)",
        "required": false,
        "description": "Optional Audius API key for higher API limits. Public read-only access works without a key."
      }
    ]
  },
  "source": {
    "provider": "Audius",
    "api": "https://api.audius.co/v1",
    "audioOnly": true
  }
}
