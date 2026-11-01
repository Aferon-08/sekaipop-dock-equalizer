# Благодарности и сторонние компоненты

Этот проект разработан как дополнение к [SekaiPOP / Blapples](https://github.com/Blapples/SekaiPop), с использованием его интерфейса плагинов, темы, медиаданных и лирики. Shell распространяется под GPL-3.0. Проект не аффилирован с авторами SekaiPOP, Apple, Google, Spotify или YouTube.

Визуальное направление: Material / Material 3 Expressive, мягкие объёмные формы и стеклянные эффекты. Иконки управления в `assets/` происходят из пользовательского макета; исходники SVG включены. Текст коротких демонстраций написан специально для проекта; аудио и обложки коммерческих песен не включены.

| Проект | Применение | Доставка |
|---|---|---|
| [Quickshell](https://quickshell.org/) и [Qt](https://www.qt.io/) | QML, окна Wayland, MPRIS, шейдеры, процессы, WorkerScript. | Системные зависимости. |
| [CAVA](https://github.com/karlstav/cava) | Спектр звука системного аудиовыхода. | Системная зависимость. |
| [Lyrics Wordtime Extractor](https://github.com/FASTDROPX/Lyrics-wordtime-extractor) | Исходный обработчик таймингов; закреплённая revision `6fd129aa4b8295eaf92e61055fcf886bd4f474b1`. | Отдельно загружается setup-wordtime.py. |
| [OpenAI Whisper](https://github.com/openai/whisper), [stable-ts](https://github.com/jianfch/stable-ts), [PyTorch](https://pytorch.org/) | Локальное выравнивание/инференс. | В отдельном окружении. |
| [Demucs](https://github.com/facebookresearch/demucs) | Выделение вокала для дальнейшей оценки партий. | Необязательное окружение/модель. |
| [UNMIXX](https://github.com/jihoojung0106/unmixx) | Разделение перекрывающегося вокала; revision `8e750521b5942f4717656cac86a23cf0bd90dea5`. | Отдельный checkout и веса. |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) / 3D-Speaker CAM++ | Признаки голосов. | Необязательная модель. |
| [Sony CSL Paris ssl-singer-identity](https://github.com/SonyCSLParis/ssl-singer-identity) и [singer-identity weights](https://huggingface.co/BernardoTorres/singer-identity) | Певческие представления голоса. | Отдельная модель; точный URL и checksum в setup-multivoice.py. |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp), [FFmpeg](https://ffmpeg.org/) | Запрошенный YouTube-источник, декодирование аудио и сборка демонстраций. | Отдельные зависимости. |

Код и веса этих проектов **не включены** в данный репозиторий, за исключением собственного сгенерированного пакета WorkerScript из собственных JS-модулей. Их условия и условия распространения весов устанавливаются соответствующими авторами; лицензия этого репозитория не предоставляет дополнительных прав на внешние модели или музыку. Scripts закрепляют revisions и проверяют заданные контрольные суммы для моделей, где это реализовано.
