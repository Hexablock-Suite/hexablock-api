# Docs

This index lists the requirements, the design notes and the architecture documents of this repository. The HTTP API guide is Swagger at `/docs`, and the committed [openapi/openapi.json](../openapi/openapi.json) holds the same document.

- [REQUIREMENTS.md](REQUIREMENTS.md): the backend requirements in our own words, with the assumptions that shape the API.
- [level-format.md](level-format.md): the shared JSON level format of the app and the API (S3-02), with one complete Fit example and one complete Sort example.
- [architecture/layers.md](architecture/layers.md): the four Clean layers of the API and the place of each main component.
- [architecture/classes.md](architecture/classes.md): the class diagram per layer, the design patterns and the numbered design decisions.
- [architecture/flows.md](architecture/flows.md): how a use case crosses the four layers, as a class view and a sequence diagram.
- [architecture/extensibility.md](architecture/extensibility.md): the extensibility diagram, with the application core in the center and its extension points.
- [EXTENSIBILITY.md](EXTENSIBILITY.md): for each extension axis of that diagram, the class that a developer adds and the file that registers it.
