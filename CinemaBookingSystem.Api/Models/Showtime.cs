namespace CinemaBookingSystem.Api.Models;

public class Showtime
{
    public int Id { get; set; }
    public int MovieId { get; set; }
    public DateTime StartTime { get; set; }
    public string Auditorium { get; set; } = string.Empty;
    public string AuditoriumType { get; set; } = "regular";
    public Movie? Movie { get; set; }
    public ICollection<Seat> Seats { get; set; } = new List<Seat>();
    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
}
