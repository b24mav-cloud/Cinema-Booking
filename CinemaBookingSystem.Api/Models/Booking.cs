namespace CinemaBookingSystem.Api.Models;

public class Booking
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int ShowtimeId { get; set; }
    public string UserEmail { get; set; } = string.Empty;
    public List<int> SeatIds { get; set; } = new();
    public decimal TotalAmount { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsConfirmed { get; set; } = false;
    public Showtime? Showtime { get; set; }
}
