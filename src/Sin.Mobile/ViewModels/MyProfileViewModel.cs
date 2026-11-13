using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Sin.Mobile.Services;
using Sin.Shared;

namespace Sin.Mobile.ViewModels;

public partial class MyProfileViewModel(Session session, ApiClient api) : BaseViewModel(session)
{
    public IReadOnlyList<Gender> Genders { get; } = Enum.GetValues<Gender>();
    public IReadOnlyList<InterestedIn> Interests { get; } = Enum.GetValues<InterestedIn>();
    public IReadOnlyList<CategoryOption> Categories { get; } =
        Enum.GetValues<FlawCategory>().Select(c => new CategoryOption(c)).ToList();

    public ObservableCollection<FlawDto> Flaws { get; } = [];

    [ObservableProperty] private string _displayName = "";
    [ObservableProperty] private string _ageText = "";
    [ObservableProperty] private string? _headline;
    [ObservableProperty] private Gender _gender;
    [ObservableProperty] private InterestedIn _interestedIn;
    [ObservableProperty] private string? _photoUrl;

    [ObservableProperty] private string _newFlawText = "";
    [ObservableProperty] private CategoryOption? _newFlawCategory;
    [ObservableProperty] private string _flawCount = "";

    public async Task LoadAsync()
    {
        NewFlawCategory ??= Categories[0];
        await TryAsync(async () => Apply(await api.GetMeAsync()));
    }


    private void Apply(ProfileDto p)
    {
        DisplayName = p.DisplayName;
        AgeText = p.Age >= 18 ? p.Age.ToString() : "";
        Headline = p.Headline;
        Gender = p.Gender;
        InterestedIn = p.InterestedIn;
        PhotoUrl = p.PhotoUrl;
        Flaws.Clear();
        foreach (var f in p.Flaws) Flaws.Add(f);
        UpdateCount();
    }

    private void UpdateCount() =>
        FlawCount = Flaws.Count == 0
            ? "Hidden from the feed until you confess something"
            : $"{Flaws.Count} of {Limits.MaxFlaws} confessed";

    [RelayCommand]
    private async Task AddFlaw()
    {
        if (string.IsNullOrWhiteSpace(NewFlawText)) return;
        await TryAsync(async () =>
        {
            var flaw = await api.AddFlawAsync(new CreateFlawRequest(NewFlawCategory?.Value ?? FlawCategory.Other, NewFlawText.Trim()));
            Flaws.Add(flaw);
            NewFlawText = "";
            UpdateCount();
        });
    }

    [RelayCommand]
    private async Task DeleteFlaw(FlawDto flaw)
    {
        if (!await Shell.Current.DisplayAlert("Take it back?", flaw.Text, "Delete", "Keep"))
            return;
        await TryAsync(async () =>
        {
            await api.DeleteFlawAsync(flaw.Id);
            Flaws.Remove(flaw);
            UpdateCount();
        });
    }

    [RelayCommand]
    private async Task SaveProfile()
    {
        if (!int.TryParse(AgeText, out var age))
        {
            await Alert("Age", "Enter your age as a number.");
            return;
        }
        if (await TryAsync(async () => Apply(await api.UpdateMeAsync(new UpdateProfileRequest(DisplayName, age, Gender, InterestedIn, Headline)))))
            await Alert("Saved", "Your shortcomings have been updated.");
    }

    [RelayCommand]
    private async Task PickPhoto()
    {
        FileResult? file;
        try
        {
            file = await MediaPicker.Default.PickPhotoAsync(new MediaPickerOptions { Title = "Your least flattering photo" });
        }
        catch (PermissionException)
        {
            await Alert("Permission needed", "Allow photo access in Settings to upload a photo.");
            return;
        }
        if (file is null) return;

        await TryAsync(async () =>
        {
            await using var stream = await file.OpenReadAsync();
            var contentType = string.IsNullOrEmpty(file.ContentType) ? "image/jpeg" : file.ContentType;
            PhotoUrl = await api.UploadPhotoAsync(stream, file.FileName, contentType);
        });
    }

    [RelayCommand]
    private async Task Logout()
    {
        Session.Clear();
        await Shell.Current.GoToAsync("//login");
    }
}

/// <summary>Picker item; Picker displays ToString().</summary>
public record CategoryOption(FlawCategory Value)
{
    public override string ToString() => CategoryLabelConverter.Label(Value);
}
