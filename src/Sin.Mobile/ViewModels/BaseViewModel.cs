using System.Net;
using CommunityToolkit.Mvvm.ComponentModel;
using Sin.Mobile.Services;

namespace Sin.Mobile.ViewModels;

public abstract partial class BaseViewModel : ObservableObject
{
    protected BaseViewModel(Session session) => Session = session;

    protected Session Session { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsNotBusy))]
    private bool _isBusy;

    public bool IsNotBusy => !IsBusy;

    /// <summary>Runs an API call with busy state and friendly error handling. Returns true on success.</summary>
    protected async Task<bool> TryAsync(Func<Task> work, bool showBusy = true)
    {
        if (showBusy)
        {
            if (IsBusy) return false;
            IsBusy = true;
        }
        try
        {
            await work();
            return true;
        }
        catch (ApiException e) when (e.Status == HttpStatusCode.Unauthorized && Session.IsLoggedIn)
        {
            Session.Clear();
            await Alert("Session expired", "Log in again to keep oversharing.");
            await Shell.Current.GoToAsync("//login");
        }
        catch (ApiException e)
        {
            await Alert("Nope", e.Message);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
        {
            await Alert("Can't reach the server",
                $"Is the API running at {AppConfig.ApiBaseUrl}?\n\n{e.Message}");
        }
        finally
        {
            if (showBusy) IsBusy = false;
        }
        return false;
    }

    protected static Task Alert(string title, string message) =>
        Shell.Current.DisplayAlert(title, message, "OK");
}
