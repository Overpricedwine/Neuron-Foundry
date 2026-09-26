# Neuron Foundry

Neuron Foundry is a local-first visual editor for configuring custom neural-network projects and exporting a PyTorch/CUDA starting script.

## Run locally

```powershell
node preview-server.js
```

Open `http://127.0.0.1:4173`.

## Repository safety

This source repository contains website code and editable project designs. It deliberately excludes pretrained weights, checkpoints, optimizer state, model files, local environment variables, and secrets.

GitHub import reads only `project.json` and removes any trained-weight fields before loading a design into the editor.
