using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Sin.Mobile.Services;
using Sin.Shared;

namespace Sin.Mobile.ViewModels;

public partial class RegisterViewModel(Session session, ApiClient api) : BaseViewModel(session)
{
    public IReadOnlyList<Gender> Genders { get; } = Enum.GetValues<Gender>();
    public IReadOnlyList<InterestedIn> Interests { get; } = Enum.GetValues<InterestedIn>();

    [ObservableProperty] private string _email = "";
    [ObservableProperty] private string _password = "";
    [ObservableProperty] private string _displayName = "";
    [ObservableProperty] private string _ageText = "";
    [ObservableProperty] private Gender _gender = Gender.Woman;
    [ObservableProperty] private InterestedIn _interestedIn = InterestedIn.Everyone;

    [RelayCommand]
    private async Task Register()
    {
        if (!int.TryParse(AgeText, out var age))
        {
            await Alert("Age", "Enter your age as a number. Lying about it is a flaw, but not one we accept here.");
            return;
        }

        await TryAsync(async () =>
        {
            var auth = await api.RegisterAsync(new RegisterRequest(Email.Trim(), Password, DisplayName.Trim(), age, Gender, InterestedIn));
            await Session.SaveAsync(auth);
            await Shell.Current.GoToAsync("//main/me");
            await Alert("We all got problems",
                "Nobody will see you until you confess at least one flaw. Go on. Get it off your chest.");
        });
    }
}
