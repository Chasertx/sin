using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Sin.Mobile.Services;
using Sin.Shared;

namespace Sin.Mobile.ViewModels;

public partial class LoginViewModel(Session session, ApiClient api) : BaseViewModel(session)
{
    [ObservableProperty] private string _email = "";
    [ObservableProperty] private string _password = "";

    /// <summary>SSO providers enabled on the server (e.g. "Google", "Apple"). Empty = hide the buttons.</summary>
    public ObservableCollection<string> Providers { get; } = [];

    [ObservableProperty] private bool _hasProviders;

    public async Task ResumeSessionAsync()
    {
        await Session.LoadAsync();
        if (Session.IsLoggedIn)
        {
            await Shell.Current.GoToAsync("//main/feed");
            return;
        }
        await LoadProvidersAsync();
    }

    private async Task LoadProvidersAsync()
    {
        try
        {
            var providers = await api.GetSsoProvidersAsync();
            // Apple first: App Store guidelines want it at least as prominent as other options.
            Providers.Clear();
            foreach (var p in providers.OrderBy(p => p == "Apple" ? 0 : 1)) Providers.Add(p);
        }
        catch
        {
            // Server unreachable: email login will surface the real error when tried.
        }
        HasProviders = Providers.Count > 0;
    }

    [RelayCommand]
    private async Task Login()
    {
        if (string.IsNullOrWhiteSpace(Email) || string.IsNullOrWhiteSpace(Password))
        {
            await Alert("Missing info", "Email and password, please.");
            return;
        }
        await TryAsync(async () =>
        {
            var auth = await api.LoginAsync(new LoginRequest(Email.Trim(), Password));
            Password = "";
            await CompleteSignInAsync(auth);
        });
    }

    /// <summary>Opens the system browser for Google/Apple; the API redirects back to sin://auth with our JWT.</summary>
    public async Task SignInWithAsync(string provider)
    {
        if (IsBusy) return;
        IsBusy = true;
        try
        {
            var result = await WebAuthenticator.Default.AuthenticateAsync(new WebAuthenticatorOptions
            {
                Url = api.SsoStartUrl(provider),
                CallbackUrl = AuthConstants.CallbackUri,
                PrefersEphemeralWebBrowserSession = true, // iOS: don't reuse Safari's session/cookies
            });

            var props = result.Properties;
            if (props.TryGetValue("error", out var error))
            {
                await Alert($"{provider} sign-in failed", Uri.UnescapeDataString(error));
                return;
            }
            if (!props.TryGetValue("token", out var token) || !props.TryGetValue("userId", out var userId)
                || !Guid.TryParse(userId, out var id))
            {
                await Alert($"{provider} sign-in failed", "The server didn't send back a session.");
                return;
            }

            props.TryGetValue("name", out var name);
            var auth = new AuthResponse(Uri.UnescapeDataString(token), id,
                Uri.UnescapeDataString(name ?? ""), props.TryGetValue("onboarding", out var o) && o == "1");
            await CompleteSignInAsync(auth);
        }
        catch (TaskCanceledException)
        {
            // User closed the browser. Nothing to do.
        }
        catch (Exception e)
        {
            await Alert($"{provider} sign-in failed", e.Message);
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task CompleteSignInAsync(AuthResponse auth)
    {
        await Session.SaveAsync(auth);
        if (auth.NeedsOnboarding)
        {
            await Shell.Current.GoToAsync("//main/me");
            await Alert("Almost in",
                "Add your age and who you're into, then confess at least one flaw. Until then, nobody can see you.");
        }
        else
        {
            await Shell.Current.GoToAsync("//main/feed");
        }
    }

    [RelayCommand]
    private Task GoToRegister() => Shell.Current.GoToAsync("register");

    /// <summary>Fills in a seeded demo account (only exists when the API seeds demo data).</summary>
    [RelayCommand]
    private void UseDemoAccount()
    {
        Email = "dana@demo.sin";
        Password = "password123";
    }
}
