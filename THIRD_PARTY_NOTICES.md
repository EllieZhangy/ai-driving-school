# Third-party speech assets

## Vosk Chinese model

- Model: `vosk-model-small-cn-0.22` by Alpha Cephei, licensed under Apache License 2.0.
- Official model list: https://alphacephei.com/vosk/models
- Download: https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip
- Original ZIP SHA-256: `3af8b0e7e0f835ae9d414ce5df580237a3cfb08d586c9fbbb0f7ff29ad5b14ba`.
- The original model files are unchanged and repacked into `models/vosk-model-small-cn-0.22.tar.gz` with the top-level folder named `model`, as required by the browser loader.
- License copy: `models/LICENSE.txt`.

## Vosk browser runtime

- Library: `vosk-browser@0.0.8` by the Vosk-Browser contributors, licensed under Apache License 2.0.
- Project: https://github.com/ccoreilly/vosk-browser
- Package: https://registry.npmjs.org/vosk-browser/-/vosk-browser-0.0.8.tgz
- Original package SHA-256: `fd16fc7e64c935d7a79cf07c8f67d84232b6485376a59144af8a234979a9a4b4`.
- `vendor/vosk.js` is copied unchanged from the package distribution and retains its embedded notices.
- License copy: `vendor/LICENSE-vosk-browser.txt`.

The application glue and AudioWorklet are project source. Development speech fixtures are generated locally for testing and are not distributed or deployed.
