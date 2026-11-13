using Sin.Mobile.ViewModels;

namespace Sin.Mobile.Views;

public partial class ChatPage : ContentPage
{
    private readonly ChatViewModel _vm;

    public ChatPage(ChatViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        _vm.StartPolling();
    }

    protected override void OnDisappearing()
    {
        _vm.StopPolling();
        base.OnDisappearing();
    }
}
