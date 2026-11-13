using Microsoft.Extensions.Logging;
using Sin.Mobile.Services;
using Sin.Mobile.ViewModels;
using Sin.Mobile.Views;

namespace Sin.Mobile;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder.UseMauiApp<App>();

#if DEBUG
        builder.Logging.AddDebug();
#endif

        var s = builder.Services;
        s.AddSingleton<Session>();
        s.AddSingleton<ApiClient>();
        s.AddSingleton<AppShell>();

        // Tab pages live for the app's lifetime; pushed pages are created fresh each time.
        s.AddSingleton<LoginPage>().AddSingleton<LoginViewModel>();
        s.AddSingleton<FeedPage>().AddSingleton<FeedViewModel>();
        s.AddSingleton<MatchesPage>().AddSingleton<MatchesViewModel>();
        s.AddSingleton<MyProfilePage>().AddSingleton<MyProfileViewModel>();
        s.AddTransient<RegisterPage>().AddTransient<RegisterViewModel>();
        s.AddTransient<ChatPage>().AddTransient<ChatViewModel>();

        return builder.Build();
    }
}
