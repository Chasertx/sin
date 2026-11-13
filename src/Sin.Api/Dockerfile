# Build from the repo root:  docker compose up --build
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/Sin.Shared/Sin.Shared.csproj src/Sin.Shared/
COPY src/Sin.Api/Sin.Api.csproj src/Sin.Api/
RUN dotnet restore src/Sin.Api/Sin.Api.csproj
COPY src/Sin.Shared/ src/Sin.Shared/
COPY src/Sin.Api/ src/Sin.Api/
RUN dotnet publish src/Sin.Api/Sin.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
RUN mkdir -p /data /app/wwwroot/uploads
ENV ASPNETCORE_URLS=http://+:5080 \
    ConnectionStrings__Sin="Data Source=/data/sin.db"
EXPOSE 5080
ENTRYPOINT ["dotnet", "Sin.Api.dll"]
