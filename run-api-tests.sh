#!/usr/bin/env bash
# Runs the API test suite in a Linux .NET SDK container (Windows Smart App Control blocks
# freshly built test DLLs on this machine; CI runs the same way).
set -euo pipefail
cd "$(dirname "$0")"
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd -W 2>/dev/null || pwd):/src:ro" \
  -v gwyg-nuget:/root/.nuget/packages \
  -v gwyg-testresults:/results \
  mcr.microsoft.com/dotnet/sdk:8.0 bash -c '
    mkdir -p /w && tar -C /src --exclude=./app --exclude=./.git --exclude="*/bin" --exclude="*/obj" -cf - . | tar -C /w -xf -
    cd /w && dotnet test tests/Sin.Api.Tests --nologo -v q \
      --logger "console;verbosity=normal" --collect:"XPlat Code Coverage" --results-directory /results "$@"'
