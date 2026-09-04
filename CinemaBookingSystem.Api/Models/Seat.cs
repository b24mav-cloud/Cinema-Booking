namespace CinemaBookingSystem.Api.Models;

public class Seat
{
    public int Id { get; set; }
    public int ShowtimeId { get; set; }
    public string Row { get; set; } = string.Empty;
    public int Number { get; set; }
    public decimal Price { get; set; }
    public SeatStatus Status { get; set; } = SeatStatus.Available;
    public Showtime? Showtime { get; set; }
}
