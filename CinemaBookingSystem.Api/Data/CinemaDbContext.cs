using System.Text.Json;
using CinemaBookingSystem.Api.Models;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore;

namespace CinemaBookingSystem.Api.Data;

public class CinemaDbContext(DbContextOptions<CinemaDbContext> options) : DbContext(options)
{
    public DbSet<Movie> Movies => Set<Movie>();
    public DbSet<Showtime> Showtimes => Set<Showtime>();
    public DbSet<Seat> Seats => Set<Seat>();
    public DbSet<Booking> Bookings => Set<Booking>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Movie>(entity =>
        {
            entity.Property(movie => movie.Title).IsRequired().HasMaxLength(200);
            entity.Property(movie => movie.Synopsis).IsRequired();
            entity.Property(movie => movie.Rating).HasDefaultValue("PG").HasMaxLength(10);
            entity.HasData(
                new Movie
                {
                    Id = 1,
                    Title = "Inception",
                    Synopsis = "A skilled extractor enters the dreams of others to steal secrets.",
                    DurationMinutes = 148,
                    PosterUrl = "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
                    Rating = "PG-13"
                },
                new Movie
                {
                    Id = 2,
                    Title = "The Grand Budapest Hotel",
                    Synopsis = "A legendary concierge and his lobby boy become embroiled in a family inheritance.",
                    DurationMinutes = 100,
                    PosterUrl = "https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg",
                    Rating = "R"
                });
        });

        modelBuilder.Entity<Showtime>(entity =>
        {
            entity.Property(showtime => showtime.StartTime).IsRequired();
            entity.Property(showtime => showtime.Auditorium).HasMaxLength(100);
            entity.HasOne(showtime => showtime.Movie)
                .WithMany(movie => movie.Showtimes)
                .HasForeignKey(showtime => showtime.MovieId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Seat>(entity =>
        {
            entity.Property(seat => seat.Row).IsRequired().HasMaxLength(5);
            entity.Property(seat => seat.Price).HasPrecision(10, 2);
            entity.Property(seat => seat.Status).HasConversion<string>().HasDefaultValue(SeatStatus.Available);
            entity.HasIndex(seat => new { seat.ShowtimeId, seat.Row, seat.Number }).IsUnique();
            entity.HasOne(seat => seat.Showtime)
                .WithMany(showtime => showtime.Seats)
                .HasForeignKey(seat => seat.ShowtimeId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Booking>(entity =>
        {
            entity.HasKey(booking => booking.Id);
            entity.Property(booking => booking.UserEmail).IsRequired().HasMaxLength(320);
            entity.Property(booking => booking.TotalAmount).HasPrecision(10, 2);
            var seatIds = entity.Property(booking => booking.SeatIds)
                .HasConversion(
                    seatIds => JsonSerializer.Serialize(seatIds, (JsonSerializerOptions?)null),
                    seatIds => JsonSerializer.Deserialize<List<int>>(seatIds, (JsonSerializerOptions?)null) ?? new List<int>());
            seatIds.Metadata.SetValueComparer(new ValueComparer<List<int>>(
                (left, right) => left == null ? right == null : right != null && left.SequenceEqual(right),
                value => value == null ? 0 : value.Aggregate(0, (hash, seatId) => HashCode.Combine(hash, seatId)),
                value => value == null ? new List<int>() : value.ToList()));
            entity.HasOne(booking => booking.Showtime)
                .WithMany(showtime => showtime.Bookings)
                .HasForeignKey(booking => booking.ShowtimeId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
