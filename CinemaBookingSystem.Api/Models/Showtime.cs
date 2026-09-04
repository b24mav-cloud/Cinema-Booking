namespace CinemaBookingSystem.Api.Models;

public class Showtime
{
    public int Id { get; set; }
    public int MovieId { get; set; }
    public DateTime StartTime { get; set; }
    public string Auditorium { get; set; } = string.Empty;
    public Movie? Movie { get; set; }
    public ICollection<Seat> Seats { get; set; } = new List<Seat>();
    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
}
